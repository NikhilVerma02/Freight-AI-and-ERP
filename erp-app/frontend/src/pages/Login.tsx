import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, ApiError } from "../lib/auth";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";

type Mode = "signin" | "signup";

export default function Login() {
  const { login, signup, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");

  // sign in
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // sign up
  const [suUsername, setSuUsername] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suDisplayName, setSuDisplayName] = useState("");
  const [suRole, setSuRole] = useState<"customer" | "vendor">("customer");
  const [suCompany, setSuCompany] = useState("");
  const [suEmail, setSuEmail] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    const dest = (location.state as { from?: string } | null)?.from || "/";
    navigate(dest, { replace: true });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        username: suUsername.trim(),
        password: suPassword,
        display_name: suDisplayName.trim() || suUsername.trim(),
        role: suRole,
        company_name: suCompany.trim() || undefined,
        email: suEmail.trim() || undefined,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-slate-800 px-4 dark:from-black dark:via-navy-950 dark:to-navy-900">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(59,130,246,0.25), transparent 40%), radial-gradient(circle at 80% 0%, rgba(96,165,250,0.18), transparent 35%), radial-gradient(circle at 50% 100%, rgba(37,99,235,0.2), transparent 40%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-dark text-2xl font-bold text-white shadow-xl shadow-accent/30 ring-1 ring-white/10">
            F
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Freight ERP</h1>
            <p className="mt-1 text-sm text-slate-400">
              {mode === "signin" ? "Sign in to the system of record" : "Create a vendor or customer account"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-7 shadow-2xl ring-1 ring-black/5 dark:bg-navy-800 dark:ring-white/10">
          <div className="mb-5 flex rounded-lg bg-slate-100 p-1 dark:bg-navy-900">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "signin"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === "signup"
                  ? "bg-white text-slate-900 shadow-sm dark:bg-navy-700 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              Sign up
            </button>
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <Input
                id="username"
                label="Username"
                placeholder="e.g. admin"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Input
                id="password"
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={submitting} className="mt-1 w-full">
                {submitting ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSignUp} className="flex flex-col gap-4">
              <Select
                id="su-role"
                label="I am a..."
                value={suRole}
                onChange={(e) => setSuRole(e.target.value as "customer" | "vendor")}
              >
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
              </Select>
              <Input
                id="su-username"
                label="Username"
                placeholder="choose a username"
                autoComplete="username"
                value={suUsername}
                onChange={(e) => setSuUsername(e.target.value)}
                required
              />
              <Input
                id="su-password"
                label="Password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                value={suPassword}
                onChange={(e) => setSuPassword(e.target.value)}
                required
              />
              <Input
                id="su-display-name"
                label="Display name"
                placeholder="e.g. Acme Logistics"
                value={suDisplayName}
                onChange={(e) => setSuDisplayName(e.target.value)}
              />
              <Input
                id="su-company"
                label="Company name (optional)"
                value={suCompany}
                onChange={(e) => setSuCompany(e.target.value)}
              />
              <Input
                id="su-email"
                label="Email (optional)"
                type="email"
                value={suEmail}
                onChange={(e) => setSuEmail(e.target.value)}
              />
              {suRole === "customer" && (
                <p className="rounded-lg bg-accent/5 px-3 py-2 text-xs text-slate-600 ring-1 ring-accent/20 dark:text-slate-300">
                  An admin will link your account to vendors before you can place orders.
                </p>
              )}
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800">
                  {error}
                </p>
              )}
              <Button type="submit" disabled={submitting} className="mt-1 w-full">
                {submitting ? "Creating account..." : "Create account"}
              </Button>
            </form>
          )}

          {mode === "signin" && (
            <div className="mt-5 rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-navy-900 dark:text-slate-400 dark:ring-navy-700">
              <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Demo credentials</p>
              <p>admin / admin — platform admin</p>
              <p>vendorx / vendorx — vendor (also vendory, vendorz)</p>
              <p>customera / customera — customer (also customerb)</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
