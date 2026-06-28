import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, ApiError } from "../lib/auth";
import { Button, Card, CardBody } from "../components/ui";
import { Input, Label } from "../components/ui/Input";

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
    <div className="flex min-h-screen items-center justify-center bg-slate-950 scanline-bg px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="text-3xl text-accent-400">⌬</span>
          <span className="text-2xl font-bold tracking-wide text-slate-50">Freight AI</span>
        </div>
        <Card glow>
          <CardBody>
            <h1 className="mb-1 text-lg font-semibold text-slate-100">{t("login.title")}</h1>
            <p className="mb-6 text-sm text-slate-400">{t("login.subtitle")}</p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="username">{t("login.username")}</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">{t("login.password")}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>
              {error && (
                <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {error}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("common.loading") : t("login.submit")}
              </Button>
            </form>
            <p className="mt-4 text-center text-[11px] font-mono text-slate-500">{t("login.hint")}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
