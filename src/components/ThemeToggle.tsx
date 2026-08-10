"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./ThemeScript";

type Choice = "light" | "dark" | "system";

function readChoice(): Choice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* localStorage unavailable (private mode, blocked cookies) */
  }
  return "system";
}

function apply(choice: Choice) {
  const root = document.documentElement;
  if (choice === "system") {
    root.removeAttribute("data-theme");
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  root.setAttribute("data-theme", choice);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* ignore */
  }
}

export default function ThemeToggle() {
  const [choice, setChoice] = useState<Choice>("system");

  // Two jobs: sync React state with whatever the inline script already applied,
  // and re-apply the attribute in development, where Strict Mode's extra mount
  // resets <html> to only the attributes React manages from JSX. No-op in prod.
  useLayoutEffect(() => {
    const current = readChoice();
    setChoice(current);
    if (current !== "system") {
      document.documentElement.setAttribute("data-theme", current);
    }
  }, []);

  const cycle = useCallback(() => {
    setChoice((prev) => {
      const next: Choice =
        prev === "system" ? "light" : prev === "light" ? "dark" : "system";
      apply(next);
      return next;
    });
  }, []);

  const label =
    choice === "system"
      ? "Theme: match system"
      : choice === "light"
        ? "Theme: light"
        : "Theme: dark";

  return (
    <button
      type="button"
      onClick={cycle}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {choice === "system" ? (
        <MonitorIcon className="h-4 w-4" />
      ) : choice === "light" ? (
        <SunIcon className="h-4 w-4" />
      ) : (
        <MoonIcon className="h-4 w-4" />
      )}
    </button>
  );
}

function SunIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"
      />
    </svg>
  );
}

function MoonIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 14.5A8 8 0 0 1 9.5 4a8.002 8.002 0 1 0 10.5 10.5Z"
      />
    </svg>
  );
}

function MonitorIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path strokeLinecap="round" d="M9 20h6m-3-4v4" />
    </svg>
  );
}
