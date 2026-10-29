"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "az-theme";
const THEME_COLOR: Record<Theme, string> = { light: "#F6F5F2", dark: "#111015" };

/** Read the theme the no-flash script in the root layout already applied. */
function readTheme(): Theme {
  const v = document.documentElement.dataset.theme;
  return v === "dark" ? "dark" : "light";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  function apply(t: Theme) {
    const root = document.documentElement;
    root.dataset.theme = t;
    root.style.colorScheme = t;
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* Private mode: switching still works for this session. */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEME_COLOR[t]);
    setTheme(t);
  }

  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      className="theme-toggle"
      type="button"
      onClick={() => apply(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      <span>Theme</span>
      <span className="mono">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
