import type { ReactNode } from "react";
import { getActiveBrand } from "@/lib/active-brand";
import { MobileNavToggle } from "@/components/AppShell";
import ThemeToggle from "@/components/ThemeToggle";

/** Initials for the avatar, e.g. "Royal Enfield" -> "RE". */
function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "—"
  );
}

export default async function TopBar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  // Reads the active-brand cookie so the header can't contradict the page it
  // sits above — it used to show a hardcoded brand from mock-data.
  const brand = await getActiveBrand();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <MobileNavToggle />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-fg sm:text-lg">{title}</h1>
            {subtitle && <p className="truncate text-sm text-fg-3">{subtitle}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {actions}
          {brand && (
            <span className="hidden max-w-48 truncate rounded-full border border-line bg-surface-2 px-3 py-1 text-xs text-fg-2 md:inline">
              {brand.name}
            </span>
          )}
          <ThemeToggle />
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-3 text-xs font-semibold text-fg-2"
            title={brand?.name ?? "No brand selected"}
          >
            {brand ? initials(brand.name) : "—"}
          </div>
        </div>
      </div>
    </header>
  );
}
