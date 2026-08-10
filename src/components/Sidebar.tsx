"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import BrandSwitcher from "@/components/BrandSwitcher";
import type { Brand } from "@/lib/brand-types";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: HomeIcon },
  { href: "/brands", label: "Brands", icon: BrandIcon },
  { href: "/research", label: "Competitor Research", icon: SearchIcon },
  { href: "/calendar", label: "Content Calendar", icon: CalendarIcon },
  { href: "/quality-check", label: "Quality Check", icon: CheckIcon },
  { href: "/assets", label: "Asset Library", icon: FolderIcon },
  { href: "/reels", label: "Reels", icon: ReelIcon },
  { href: "/reports", label: "Reports", icon: ChartIcon },
];

export default function Sidebar({
  brands = [],
  onNavigate,
}: {
  brands?: Brand[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-canvas-raised">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-[11px] font-bold text-accent-fg">
          SA
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-none text-fg">
            Social Automation
          </p>
          <p className="mt-1 text-xs leading-none text-fg-3">Content pipeline</p>
        </div>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "relative flex items-center gap-3 rounded-lg bg-accent-soft px-3 py-2 text-sm font-medium text-accent"
                  : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg"
              }
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-accent"
                />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-line px-4 py-4">
        <BrandSwitcher brands={brands} onNavigate={onNavigate} />
      </div>
    </aside>
  );
}

function HomeIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11.5 12 4l9 7.5" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 10v9a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1v-9"
      />
    </svg>
  );
}

function BrandIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V8l8-4 8 4v12" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20v-6h6v6M4 20h16" />
    </svg>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="m20 20-3.5-3.5" />
    </svg>
  );
}

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function CheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 12 2.5 2.5L15.5 9" />
    </svg>
  );
}

function FolderIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
      />
    </svg>
  );
}

function ReelIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8.5 4l2.5 5M15 4l2.5 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m11 12.5 4 2.25-4 2.25v-4.5Z" />
    </svg>
  );
}

function ChartIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M12 20V4M20 20v-7" />
    </svg>
  );
}
