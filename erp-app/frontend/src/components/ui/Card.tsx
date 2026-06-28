import React from "react";

export function Card({
  className = "",
  children,
  interactive = false,
  hoverable = false,
}: {
  className?: string;
  children: React.ReactNode;
  interactive?: boolean;
  hoverable?: boolean;
}) {
  const isInteractive = interactive || hoverable;
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-card dark:border-navy-700 dark:bg-navy-800 dark:shadow-none ${
        isInteractive
          ? "transition-all duration-200 hover:shadow-xl hover:-translate-y-1 hover:border-accent/60 dark:hover:shadow-2xl dark:hover:shadow-black/40 dark:hover:border-accent/60"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  accent = "text-slate-900 dark:text-slate-100",
  icon,
  iconBg = "bg-accent/10 text-accent",
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  icon?: React.ReactNode;
  iconBg?: string;
}) {
  return (
    <Card interactive className="overflow-hidden p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${accent}`}>{value}</p>
        </div>
        {icon && (
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-lg ${iconBg}`}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
