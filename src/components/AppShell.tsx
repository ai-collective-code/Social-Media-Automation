"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import type { Brand } from "@/lib/brand-types";

type ShellState = {
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
};

const ShellContext = createContext<ShellState | null>(null);

export function useShell() {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used inside AppShell");
  return ctx;
}

export default function AppShell({
  children,
  brands = [],
}: {
  children: React.ReactNode;
  brands?: Brand[];
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  const openNav = useCallback(() => setNavOpen(true), []);
  const closeNav = useCallback(() => setNavOpen(false), []);

  // Navigating on a phone should dismiss the drawer it was opened from.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  // Escape closes the drawer, matching every other overlay convention.
  useEffect(() => {
    if (!navOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    <ShellContext.Provider value={{ navOpen, openNav, closeNav }}>
      <div className="flex min-h-screen lg:h-screen lg:overflow-hidden">
        {/* Desktop: a permanent column. */}
        <div className="hidden lg:flex">
          <Sidebar brands={brands} />
        </div>

        {/* Mobile: an off-canvas drawer over a dimmed page. */}
        {navOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close navigation"
              onClick={closeNav}
              className="absolute inset-0 bg-black/50"
            />
            <div className="animate-fade-rise relative flex h-full w-64 max-w-[82vw]">
              <Sidebar brands={brands} onNavigate={closeNav} />
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto">{children}</main>
      </div>
    </ShellContext.Provider>
  );
}

export function MobileNavToggle() {
  const { openNav } = useShell();
  return (
    <button
      type="button"
      onClick={openNav}
      aria-label="Open navigation"
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg lg:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
        <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    </button>
  );
}
