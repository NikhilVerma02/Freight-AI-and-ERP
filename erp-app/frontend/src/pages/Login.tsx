import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth, ApiError } from "../lib/auth";
import { api } from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Input";

type Mode = "signin" | "signup";

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

/** Original inline illustration (no external image) standing in for the reference's photo
 * panel — a stylized skyline using only the app's existing accent palette. */
function SkylineIllustration() {
  return (
    <svg viewBox="0 0 400 600" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1e3a8a" />
        </linearGradient>
        <linearGradient id="bld1" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <rect width="400" height="600" fill="url(#sky)" />
      <g opacity="0.5">
        <circle cx="320" cy="90" r="60" fill="#93c5fd" opacity="0.25" />
        <circle cx="80" cy="60" r="40" fill="#bfdbfe" opacity="0.2" />
      </g>
      <g fill="url(#bld1)">
        <rect x="20" y="360" width="50" height="240" />
        <rect x="80" y="300" width="40" height="300" />
        <rect x="130" y="400" width="55" height="200" />
        <rect x="195" y="260" width="45" height="340" />
        <rect x="250" y="340" width="60" height="260" />
        <rect x="320" y="380" width="50" height="220" />
      </g>
      <g fill="#dbeafe" opacity="0.5">
        {Array.from({ length: 26 }).map((_, i) => (
          <rect key={i} x={28 + (i % 6) * 56} y={280 + Math.floor(i / 6) * 30} width="8" height="10" />
        ))}
      </g>
      <g stroke="#bfdbfe" strokeWidth="2" opacity="0.4" fill="none">
        <path d="M0 600 Q 100 560 200 590 T 400 570" />
      </g>
    </svg>
  );
}

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
  const [passwordPolicy, setPasswordPolicy] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ description: string }>("/api/auth/password-policy")
      .then((res) => setPasswordPolicy(res.description))
      .catch(() => {
        /* non-critical hint text — fail silently */
      });
  }, []);

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
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white px-4 py-10 dark:from-navy-950 dark:via-navy-900 dark:to-black">
      <div className="relative flex w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-navy-800 dark:ring-white/10">
        {/* Left: form panel */}
        <div className="flex w-full flex-col gap-5 p-8 sm:p-10 md:w-[55%]">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dark text-lg font-bold text-white shadow-lg shadow-accent/30">
            F
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              {mode === "signin" ? "Sign In" : "Sign Up"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {mode === "signin"
                ? "Welcome to Freight ERP. Please enter your username and password."
                : "Create a vendor or customer account to get started."}
            </p>
          </div>

          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="flex flex-col gap-4">
              <Input
                id="username"
                icon={<UserIcon />}
                placeholder="Username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Input
                id="password"
                icon={<LockIcon />}
                type="password"
                placeholder="Password"
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
                {submitting ? "Signing in..." : "Sign In"}
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
              <Input id="su-username" icon={<UserIcon />} placeholder="Choose a username" autoComplete="username" value={suUsername} onChange={(e) => setSuUsername(e.target.value)} required />
              <div>
                <Input
                  id="su-password"
                  icon={<LockIcon />}
                  type="password"
                  placeholder="Password"
                  autoComplete="new-password"
                  minLength={8}
                  value={suPassword}
                  onChange={(e) => setSuPassword(e.target.value)}
                  required
                />
                {passwordPolicy && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{passwordPolicy}</p>}
              </div>
              <Input id="su-display-name" label="Display name" placeholder="e.g. Acme Logistics" value={suDisplayName} onChange={(e) => setSuDisplayName(e.target.value)} />
              <Input id="su-company" label="Company name (optional)" value={suCompany} onChange={(e) => setSuCompany(e.target.value)} />
              <Input id="su-email" label="Email (optional)" type="email" value={suEmail} onChange={(e) => setSuEmail(e.target.value)} />
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
                {submitting ? "Creating account..." : "Register"}
              </Button>
            </form>
          )}

          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mode === "signin" ? (
              <>
                Don't have an account?{" "}
                <button type="button" onClick={() => switchMode("signup")} className="font-medium text-accent hover:underline">
                  Click here to Sign Up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button type="button" onClick={() => switchMode("signin")} className="font-medium text-accent hover:underline">
                  Click here to Sign In
                </button>
              </>
            )}
          </p>

          {mode === "signin" && (
            <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500 ring-1 ring-slate-200 dark:bg-navy-900 dark:text-slate-400 dark:ring-navy-700">
              <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">Demo credentials</p>
              <p>admin / Admin@123 — platform admin</p>
              <p>vendorx / Vendorx@123 — vendor (also vendory, vendorz)</p>
              <p>customera / Customera@123 — customer (also customerb)</p>
            </div>
          )}
        </div>

        {/* Right: illustration panel */}
        <div className="relative hidden w-[45%] md:block">
          <SkylineIllustration />
          <div className="absolute inset-0 bg-gradient-to-t from-navy-950/30 via-transparent to-transparent" />
        </div>
      </div>
    </div>
  );
}
