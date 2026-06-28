import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Role, useAuth } from "../lib/auth";
import { getLanguage, setLanguage } from "../lib/i18n";
import { Button } from "./ui";

const navItems: { to: string; key: string; icon: string; roles: Role[] }[] = [
  { to: "/intake", key: "intake", icon: "▣", roles: ["admin", "vendor", "customer"] },
  { to: "/history", key: "history", icon: "☰", roles: ["admin", "vendor", "customer"] },
  { to: "/claims", key: "claims", icon: "🧾", roles: ["admin", "vendor", "customer"] },
  { to: "/orders", key: "orders", icon: "🔁", roles: ["admin", "vendor", "customer"] },
  { to: "/kpi", key: "kpi", icon: "▥", roles: ["admin"] },
  { to: "/logs", key: "logs", icon: "▦", roles: ["admin"] },
];

// Top navbar instead of a fixed-width sidebar — the case intake/detail/chat
// pages run wide (forms, agent-flow cards), so we want full viewport width
// for content rather than a permanent left-hand column eating into it.
export function Layout() {
  const { t } = useTranslation();
  const { user, logout, hasRole } = useAuth();
  const [lang, setLang] = React.useState(getLanguage());
  const visibleNavItems = navItems.filter((item) => hasRole(...item.roles));

  function toggleLang() {
    const next = lang === "en" ? "hi" : "en";
    setLanguage(next);
    setLang(next);
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 scanline-bg text-slate-100">
      <header className="flex items-center gap-6 border-b border-slate-800 bg-slate-950/95 px-6 py-3 shadow-[0_1px_0_0_rgba(34,211,238,0.08)]">
        <div className="flex items-center gap-2">
          <span className="text-xl text-accent-400">⌬</span>
          <div>
            <div className="text-sm font-bold leading-tight tracking-wide text-slate-50">{t("app.name")}</div>
            <div className="text-[9px] font-mono uppercase tracking-widest text-accent-400/70">{t("app.tagline")}</div>
          </div>
        </div>

        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-accent-500/10 text-accent-300 border border-accent-500/30"
                    : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                }`
              }
            >
              <span className="font-mono text-base">{item.icon}</span>
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-xs font-mono text-slate-500 sm:block">
            {user && (
              <>
                <span className="text-slate-300">{user.display_name}</span>
                <span className="mx-2 text-slate-600">·</span>
                <span className="text-accent-400">
                  {t("topbar.role")}: {user.role}
                </span>
              </>
            )}
          </div>
          <button
            onClick={toggleLang}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-mono uppercase tracking-wide text-slate-300 hover:border-accent-400 hover:text-accent-300"
          >
            {lang === "en" ? "EN / हिं" : "हिं / EN"}
          </button>
          <Button variant="secondary" size="sm" onClick={logout}>
            {t("topbar.logout")}
          </Button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
