"""
Intake agent — Multimodal step.

If a video is supplied: runs the ffmpeg media pipeline to get sampled
frames + audio, transcribes the audio (TRANSCRIBE model), and asks the
VISION model to describe visible damage from the frames.

If `manual_transcript` is supplied instead (dev/QA override — see plan),
skips media/transcription entirely and treats the provided text as the
"voiceover" transcript directly.

Either way, the combined transcript + vision description is then passed to
the `agent` model with a structured-JSON-output prompt to extract:
{po_number, item_type, damage_type, damaged_qty, confidence_notes}
"""
from __future__ import annotations

import json
import logging
import re

from app.llm_client import LLMClient, image_path_to_b64
from app.media_pipeline import MediaPipelineError, extract_media_ctx

logger = logging.getLogger("ai_app.agents.intake")

EXTRACTION_SYSTEM_PROMPT = (
    "You are a freight damage intake specialist. Given a transcript (voiceover from a "
    "warehouse worker) and optionally a vision-model description of photographed/filmed "
    "damage, extract structured case facts. Respond with ONLY a JSON object with these exact "
    "keys: po_number (string or null), item_type (string), damage_type (string, e.g. "
    "'moisture/water damage', 'crushing', 'impact'), damaged_qty (integer or null), "
    "confidence_notes (short string explaining any uncertainty). No prose, no markdown fences."
)


def _safe_json_parse(text: str | None) -> dict | None:
    if not text:
        return None
    text = text.strip()
    # Strip markdown code fences if the model added them despite instructions.
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
        return None


async def run_intake(
    llm_client: LLMClient,
    video_path: str | None,
    manual_transcript: str | None,
) -> dict:
    """Returns a result dict with keys: extracted (dict|None), raw (dict with sub-call envelopes),
    status ('ok'|'failed'), error (str|None)."""
    raw: dict = {"transcribe": None, "vision": None, "extract": None, "media_error": None}
    transcript_text = manual_transcript
    vision_description = None

    if video_path and not manual_transcript:
        try:
            with extract_media_ctx(video_path, num_frames=3) as media:
                transcribe_result = llm_client.transcribe(media["audio_path"])
                raw["transcribe"] = transcribe_result
                if transcribe_result["status"] == "ok":
                    transcript_text = transcribe_result["content"]
                else:
                    transcript_text = transcript_text or ""
                    logger.warning("Transcription failed: %s", transcribe_result.get("error"))

                if media["frame_paths"]:
                    try:
                        images_b64 = [image_path_to_b64(p) for p in media["frame_paths"]]
                        vision_result = llm_client.vision(
                            "vision",
                            images_b64,
                            "Describe any visible physical damage to the freight/packaging in these frames "
                            "(e.g. water/moisture damage, crushing, punctures, broken seals). Be specific and concise.",
                        )
                        raw["vision"] = vision_result
                        if vision_result["status"] == "ok":
                            vision_description = vision_result["content"]
                        else:
                            logger.warning("Vision call failed: %s", vision_result.get("error"))
                    except Exception as exc:
                        logger.error("Vision call raised: %s", exc)
                        raw["vision"] = {"status": "error", "error": str(exc)}
        except MediaPipelineError as exc:
            logger.warning("Media pipeline unavailable/failed: %s", exc)
            raw["media_error"] = str(exc)
            transcript_text = transcript_text or ""

    if not transcript_text:
        transcript_text = ""

    combined = transcript_text
    if vision_description:
        combined += f"\n\n[Vision analysis of frames]: {vision_description}"

    if not combined.strip():
        return {
            "extracted": None,
            "raw": raw,
            "status": "failed",
            "error": "No transcript or manual_transcript provided, and no usable media/vision output.",
        }

    extract_messages = [
        {"role": "system", "content": EXTRACTION_SYSTEM_PROMPT},
        {"role": "user", "content": combined},
    ]
    extract_result = llm_client.chat("agent", extract_messages, temperature=0)
    raw["extract"] = extract_result

    if extract_result["status"] != "ok":
        return {
            "extracted": None,
            "raw": raw,
            "status": "failed",
            "error": f"Extraction LLM call failed: {extract_result.get('error')}",
        }

    extracted = _safe_json_parse(extract_result["content"])
    if extracted is None:
        return {
            "extracted": None,
            "raw": raw,
            "status": "failed",
            "error": f"Could not parse structured JSON from model output: {extract_result['content']!r}",
        }

    return {"extracted": extracted, "raw": raw, "status": "ok", "error": None}
