import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth, type Role } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { useAlerts } from "../lib/alerts";
import ChatWidget from "./ChatWidget";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  admin: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/vendors", label: "Vendors", icon: "🏭" },
    { to: "/customers", label: "Customers", icon: "🏢" },
    { to: "/vendor-inventory", label: "Vendor Inventory", icon: "📦" },
    { to: "/customer-inventory", label: "Customer Inventory", icon: "🚚" },
    { to: "/orders", label: "Orders", icon: "🧾" },
    { to: "/claims", label: "Claims", icon: "📋" },
    { to: "/users", label: "Users", icon: "👤" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
    { to: "/audit-logs", label: "Audit Logs", icon: "🕒" },
    { to: "/rag-evaluation", label: "RAG Evaluation", icon: "🧪" },
  ],
  vendor: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/orders", label: "Orders", icon: "🧾" },
    { to: "/claims", label: "Claims", icon: "📋" },
    { to: "/sla-upload", label: "Upload SLA", icon: "📄" },
    { to: "/my-customers", label: "My Customers", icon: "🏢" },
    { to: "/vendor-inventory", label: "My Inventory", icon: "📦" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
    { to: "/rag-evaluation", label: "RAG Evaluation", icon: "🧪" },
  ],
  customer: [
    { to: "/", label: "Dashboard", icon: "📊" },
    { to: "/orders", label: "Orders", icon: "🧾" },
    { to: "/claims", label: "Claims", icon: "📋" },
    { to: "/sla", label: "SLA", icon: "📄" },
    { to: "/my-vendors", label: "My Vendors", icon: "🏭" },
    { to: "/customer-inventory", label: "My Inventory", icon: "📦" },
    { to: "/alerts", label: "Alerts", icon: "🚨" },
    { to: "/rag-evaluation", label: "RAG Evaluation", icon: "🧪" },
  ],
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  vendor: "Vendor",
  customer: "Customer",
};

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute h-4.5 w-4.5 transition-all duration-300 ${
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`absolute h-4.5 w-4.5 transition-all duration-300 ${
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        }`}
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { unreadCount } = useAlerts();
  const navItems = user ? NAV_BY_ROLE[user.role] ?? [] : [];

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-navy-950">
      <aside className="flex w-64 flex-shrink-0 flex-col bg-navy-900 text-slate-200 dark:bg-navy-950 dark:border-r dark:border-navy-800">
        <div className="flex items-center gap-3 px-5 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-dark text-lg font-bold text-white shadow-lg shadow-accent/30">
            F
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Freight ERP</p>
            <p className="text-[11px] text-slate-400">System of Record</p>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const showBadge = item.to === "/alerts" && unreadCount > 0;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ${
                    isActive
                      ? "bg-accent text-white shadow-md shadow-accent/20"
                      : "text-slate-300 hover:bg-navy-700/70 hover:text-white hover:translate-x-0.5"
                  }`
                }
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {showBadge && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-none text-white shadow-sm shadow-rose-500/40 animate-pulse">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
        <div className="border-t border-navy-700 p-4 text-xs text-slate-500">
          Freight ERP v1.0 · Hackathon Build
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3.5 shadow-sm dark:border-navy-800 dark:bg-navy-900 dark:shadow-none">
          <div />
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <div className="flex items-center gap-3 rounded-full bg-slate-50 px-3 py-1.5 ring-1 ring-slate-200 dark:bg-navy-800 dark:ring-navy-700">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-dark text-sm font-semibold text-white">
                {user?.display_name?.charAt(0) ?? "?"}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">
                  {user?.display_name}
                </p>
                <p className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                  {user ? ROLE_LABELS[user.role] ?? user.role : ""}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              Log out
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
      <ChatWidget />
    </div>
  );
}
