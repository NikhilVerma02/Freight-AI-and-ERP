import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Role, useAuth } from "../lib/auth";
import { getLanguage, setLanguage } from "../lib/i18n";
import { Button } from "./ui";

const navItems: { to: string; key: string; icon: string; roles: Role[] }[] = [
  { to: "/intake", key: "intake", icon: "▣", roles: ["admin", "vendor", "customer"] },
  { to: "/history", key: "history", icon: "☰", roles: ["admin", "vendor", "customer"] },
  { to: "/chat", key: "chat", icon: "◈", roles: ["admin", "vendor", "customer"] },
  { to: "/kpi", key: "kpi", icon: "▥", roles: ["admin"] },
  { to: "/logs", key: "logs", icon: "▦", roles: ["admin"] },
];

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
    <div className="flex h-screen bg-slate-950 scanline-bg text-slate-100">
      <aside className="flex w-60 flex-col border-r border-slate-800 bg-slate-950/90">
        <div className="flex items-center gap-2 border-b border-slate-800 px-5 py-5">
          <span className="text-xl text-accent-400">⌬</span>
          <div>
            <div className="text-sm font-bold tracking-wide text-slate-50">{t("app.name")}</div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent-400/70">
              {t("app.tagline")}
            </div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-4">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
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
        <div className="border-t border-slate-800 px-4 py-3 text-[10px] font-mono text-slate-600">
          v1.0.0 · agentic-ops
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-6 py-3">
          <div className="text-xs font-mono text-slate-500">
            {user && (
              <>
                <span className="text-slate-300">{user.display_name}</span>
                <span className="mx-2 text-slate-600">·</span>
                <span className="text-accent-400">{t("topbar.role")}: {user.role}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3">
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
    </div>
  );
}
