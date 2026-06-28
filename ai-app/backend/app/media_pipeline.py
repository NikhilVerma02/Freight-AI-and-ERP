"""
ffmpeg-based media pipeline: given an uploaded video file, extract N evenly
sampled JPEG frames and the audio track as 16kHz mono WAV, for the intake
agent's vision + transcription calls.

ffmpeg is invoked via subprocess (no ffmpeg-python dependency needed). The
binary's presence is checked up front via shutil.which so a missing
install produces a clear, caught MediaPipelineError instead of a confusing
subprocess crash deep in the pipeline.
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tempfile
import uuid
from contextlib import contextmanager
from pathlib import Path

logger = logging.getLogger("ai_app.media_pipeline")


class MediaPipelineError(Exception):
    """Raised for any unrecoverable media-pipeline failure (missing ffmpeg, bad video, etc.)."""


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None and shutil.which("ffprobe") is not None


def _require_ffmpeg() -> None:
    if not ffmpeg_available():
        raise MediaPipelineError(
            "ffmpeg/ffprobe binary not found on PATH. Install ffmpeg and ensure it is on PATH "
            "to enable video frame/audio extraction. (The manual_transcript override can be used "
            "to test the rest of the pipeline without ffmpeg.)"
        )


def _probe_duration_seconds(video_path: str) -> float:
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "json", video_path,
            ],
            capture_output=True, text=True, timeout=30, check=True,
        )
        data = json.loads(out.stdout)
        return float(data["format"]["duration"])
    except Exception as exc:
        raise MediaPipelineError(f"ffprobe failed to read duration for {video_path}: {exc}") from exc


def extract_media(video_path: str, num_frames: int = 3, work_dir: str | None = None) -> dict:
    """Extract N evenly-sampled JPEG frames + 16kHz mono WAV audio from video_path.

    Returns {"frame_paths": [...], "audio_path": str, "work_dir": str}.
    Caller is responsible for cleanup (see cleanup_media() / extract_media_ctx()).
    """
    _require_ffmpeg()

    video_file = Path(video_path)
    if not video_file.exists():
        raise MediaPipelineError(f"Video file not found: {video_path}")

    base_dir = Path(work_dir) if work_dir else Path(tempfile.gettempdir())
    run_dir = base_dir / f"media_{uuid.uuid4().hex[:10]}"
    run_dir.mkdir(parents=True, exist_ok=True)

    duration = _probe_duration_seconds(str(video_file))
    if duration <= 0:
        duration = 1.0

    frame_paths: list[str] = []
    try:
        for i in range(num_frames):
            # Evenly spaced timestamps, avoiding the very first/last edge frames.
            ts = duration * (i + 1) / (num_frames + 1)
            frame_path = run_dir / f"frame_{i+1}.jpg"
            subprocess.run(
                [
                    "ffmpeg", "-y", "-ss", f"{ts:.3f}", "-i", str(video_file),
                    "-frames:v", "1", "-q:v", "2", str(frame_path),
                ],
                capture_output=True, text=True, timeout=60, check=True,
            )
            if frame_path.exists():
                frame_paths.append(str(frame_path))
            else:
                logger.warning("Frame extraction produced no file at t=%.2fs for %s", ts, video_path)

        audio_path = run_dir / "audio.wav"
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", str(video_file),
                "-vn", "-ac", "1", "-ar", "16000", str(audio_path),
            ],
            capture_output=True, text=True, timeout=120, check=True,
        )
        if not audio_path.exists():
            raise MediaPipelineError(f"Audio extraction did not produce an output file for {video_path}")

        return {"frame_paths": frame_paths, "audio_path": str(audio_path), "work_dir": str(run_dir)}
    except subprocess.CalledProcessError as exc:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise MediaPipelineError(f"ffmpeg command failed: {exc.stderr or exc}") from exc
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise MediaPipelineError(f"ffmpeg command timed out: {exc}") from exc


def cleanup_media(result: dict) -> None:
    work_dir = result.get("work_dir")
    if work_dir:
        shutil.rmtree(work_dir, ignore_errors=True)


@contextmanager
def extract_media_ctx(video_path: str, num_frames: int = 3, work_dir: str | None = None):
    """Context-manager variant: yields the extract_media() result dict and
    guarantees temp-file cleanup on exit, success or failure."""
    result = extract_media(video_path, num_frames=num_frames, work_dir=work_dir)
    try:
        yield result
    finally:
        cleanup_media(result)
