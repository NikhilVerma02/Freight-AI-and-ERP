import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { getLanguage } from "../lib/i18n";
import { Badge, statusToTone, Button, Card, CardBody, CardHeader, CardTitle, CardSubtitle, Spinner, CodeBlock } from "../components/ui";
import { Label, Select, Textarea } from "../components/ui/Input";
import type { PipelineRunResult } from "../lib/types";

const STEP_KEYS = ["intake", "policy", "inventory", "claim"] as const;
type StepKey = typeof STEP_KEYS[number];

export default function CaseIntake() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [video, setVideo] = useState<File | null>(null);
  const [manualTranscript, setManualTranscript] = useState("");
  const [language, setLanguageField] = useState(getLanguage());
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineRunResult | null>(null);
  const [revealed, setRevealed] = useState<Set<StepKey>>(new Set());

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.[0]) setVideo(e.dataTransfer.files[0]);
  }

  async function revealSteps(run: PipelineRunResult) {
    setRevealed(new Set());
    for (const key of STEP_KEYS) {
      await new Promise((res) => setTimeout(res, 550));
      setRevealed((prev) => new Set(prev).add(key));
      if (run[key] && (run[key] as { status?: string }).status === "failed" && key === "intake") {
        break; // mirror backend: intake failure aborts downstream steps
      }
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setRevealed(new Set());

    if (!video && !manualTranscript.trim()) {
      setError(t("intake.noInputError"));
      return;
    }

    const formData = new FormData();
    if (video) formData.append("video", video);
    if (manualTranscript.trim()) formData.append("manual_transcript", manualTranscript.trim());
    formData.append("language", language);

    setRunning(true);
    try {
      const res = await api.postForm<PipelineRunResult>("/api/ingest/run", formData);
      setResult(res);
      await revealSteps(res);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const overallTone = result ? statusToTone(result.status) : "neutral";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">{t("intake.title")}</h1>
        <p className="mt-1 text-sm text-slate-400">{t("intake.subtitle")}</p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label>{t("intake.videoLabel")}</Label>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => document.getElementById("video-input")?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-8 text-center transition-colors ${
                  dragOver ? "border-accent-400 bg-accent-500/5" : "border-slate-700 hover:border-slate-600"
                }`}
              >
                <span className="text-2xl text-accent-400">⇪</span>
                <p className="mt-2 text-sm text-slate-300">{video ? video.name : t("intake.videoHint")}</p>
                <input
                  id="video-input"
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => setVideo(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div>
              <Label>{t("intake.manualLabel")}</Label>
              <Textarea
                rows={4}
                value={manualTranscript}
                onChange={(e) => setManualTranscript(e.target.value)}
                placeholder="e.g. PO 5543, three crates of electronics arrived with visible water damage on the packaging..."
              />
              <p className="mt-1 text-xs text-slate-500">{t("intake.manualHint")}</p>
            </div>

            <div className="max-w-xs">
              <Label>{t("intake.languageLabel")}</Label>
              <Select value={language} onChange={(e) => setLanguageField(e.target.value as "en" | "hi")}>
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
              </Select>
            </div>

            {error && (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}

            <Button type="submit" disabled={running}>
              {running ? (
                <>
                  <Spinner size={16} /> {t("intake.running")}
                </>
              ) : (
                t("intake.run")
              )}
            </Button>
          </form>
        </CardBody>
      </Card>

      {result && (
        <Card glow>
          <CardHeader className="flex items-center justify-between">
            <div>
              <CardTitle>Run {result.run_id}</CardTitle>
              <CardSubtitle>Agent Trace</CardSubtitle>
            </div>
            <Badge tone={overallTone}>{t(`common.${result.status}`) || result.status}</Badge>
          </CardHeader>
          <CardBody className="space-y-3">
            {STEP_KEYS.map((key) => {
              const isRevealed = revealed.has(key);
              const stepData = result[key];
              const stepStatus = stepData ? (stepData as { status?: string }).status : undefined;
              return (
                <div
                  key={key}
                  className={`rounded-md border border-slate-800 bg-slate-950/40 px-4 py-3 transition-all duration-500 ${
                    isRevealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-200">{t(`intake.step${key.charAt(0).toUpperCase()}${key.slice(1)}`)}</span>
                    {isRevealed ? (
                      stepData ? (
                        <Badge tone={statusToTone(stepStatus)}>{stepStatus}</Badge>
                      ) : (
                        <Badge tone="neutral">{t("detail.notRun")}</Badge>
                      )
                    ) : (
                      <Spinner size={14} />
                    )}
                  </div>
                  {isRevealed && stepData && (
                    <CodeBlock data={stepData} className="mt-2 max-h-48" />
                  )}
                </div>
              );
            })}

            {revealed.size === STEP_KEYS.length && (
              <div className="flex items-center justify-between rounded-md bg-slate-800/40 px-4 py-3">
                <span className="text-sm text-slate-300">
                  {result.status === "failed"
                    ? t("intake.pipelineFailed")
                    : result.status === "partial"
                    ? t("intake.pipelinePartial")
                    : t("intake.pipelineComplete")}
                </span>
                <Button size="sm" onClick={() => navigate(`/cases/${result.run_id}`)}>
                  {t("intake.viewDetail")}
                </Button>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
