import React, { createContext, useContext, useEffect, useState } from "react";

export type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Always follows the OS/browser color-scheme preference live — no manual
 * toggle, no persisted override. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (systemPrefersDark() ? "dark" : "light"));

  useEffect(() => {
    window.localStorage.removeItem("theme"); // retire the old manual-toggle preference, if any

    const root = document.documentElement;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");

    function apply(isDark: boolean) {
      root.classList.toggle("dark", isDark);
      setTheme(isDark ? "dark" : "light");
    }
    function handleChange(e: MediaQueryListEvent) {
      apply(e.matches);
    }

    apply(mql.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return <ThemeContext.Provider value={{ theme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
