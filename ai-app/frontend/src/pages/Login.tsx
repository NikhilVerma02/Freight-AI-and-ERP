import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, ApiError } from "../lib/auth";
import { Button } from "../components/ui";
import { Input, Label } from "../components/ui/Input";

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** Original inline illustration (no external image) — a neural-network/agentic-AI motif
 * using only the app's existing cyan accent palette, standing in for a photo panel. */
function NeuralNetIllustration() {
  const nodes = [
    { x: 60, y: 90 }, { x: 60, y: 220 }, { x: 60, y: 350 }, { x: 60, y: 480 },
    { x: 200, y: 150 }, { x: 200, y: 290 }, { x: 200, y: 420 },
    { x: 340, y: 110 }, { x: 340, y: 250 }, { x: 340, y: 390 }, { x: 340, y: 510 },
  ];
  const edges: [number, number][] = [
    [0, 4], [0, 5], [1, 4], [1, 5], [1, 6], [2, 5], [2, 6], [3, 6],
    [4, 7], [4, 8], [5, 7], [5, 8], [5, 9], [6, 8], [6, 9], [6, 10],
  ];
  return (
    <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="aiBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#083344" />
        </linearGradient>
        <radialGradient id="aiGlow" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="600" fill="url(#aiBg)" />
      <rect width="400" height="600" fill="url(#aiGlow)" />
      <g stroke="#22d3ee" strokeWidth="1.2" opacity="0.35">
        {edges.map(([a, b], i) => (
          <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} />
        ))}
      </g>
      <g>
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r={i % 3 === 0 ? 7 : 5} fill={i % 3 === 0 ? "#67e8f9" : "#22d3ee"} opacity={i % 3 === 0 ? 0.95 : 0.7} />
        ))}
      </g>
      <g fill="none" stroke="#67e8f9" strokeWidth="1" opacity="0.2">
        <circle cx="200" cy="300" r="220" />
        <circle cx="200" cy="300" r="160" />
      </g>
    </svg>
  );
}

export default function Login() {
  const { t } = useTranslation();
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate("/intake");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("login.error"));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 scanline-bg px-4 py-10">
      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60 shadow-glow">
        {/* Left: form panel */}
        <div className="flex w-full flex-col gap-5 p-8 sm:p-10 md:w-[55%]">
          <div className="flex items-center gap-2">
            <span className="text-2xl text-accent-400">⌬</span>
            <span className="text-lg font-bold tracking-wide text-slate-50">Freight AI</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">{t("login.title")}</h1>
            <p className="mt-1.5 text-sm text-slate-400">{t("login.subtitle")}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <Label htmlFor="username">{t("login.username")}</Label>
              <Input id="username" icon={<UserIcon />} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </div>
            <div>
              <Label htmlFor="password">{t("login.password")}</Label>
              <Input
                id="password"
                icon={<LockIcon />}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            {error && <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</div>}
            <Button type="submit" className="mt-1 w-full" disabled={loading}>
              {loading ? t("common.loading") : t("login.submit")}
            </Button>
          </form>

          <p className="text-center text-[11px] font-mono text-slate-500">{t("login.hint")}</p>
        </div>

        {/* Right: illustration panel */}
        <div className="relative hidden w-[45%] md:block">
          <NeuralNetIllustration />
        </div>
      </div>
    </div>
  );
}
