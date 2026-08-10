"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import type { Brand } from "@/lib/brand-types";
import { ACTIVE_BRAND_COOKIE } from "@/lib/active-brand-cookie";
import { Label } from "@/components/ui";

/**
 * Switches which brand you're working on.
 *
 * A native <select> rather than a custom popover: it is keyboard accessible and
 * uses the OS picker on mobile for free, which matters more here than matching
 * a bespoke menu style.
 */
export default function BrandSwitcher({
  brands,
  onNavigate,
}: {
  brands: Brand[];
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();

  /** A brand id in the URL always wins — you're looking at that brand's page. */
  const idFromPath = useMemo(() => {
    const match = /^\/brands\/([^/]+)/.exec(pathname);
    const id = match?.[1];
    return id && id !== "new" ? id : "";
  }, [pathname]);

  /**
   * Off /brands/[id] (calendar, quality check, …) the URL carries no brand, so
   * fall back to the cookie — that's what those pages are actually scoped to.
   * Read lazily rather than in an effect: `document` is unavailable during the
   * server render, and setting state from an effect would cascade a re-render.
   */
  const [cookieId, setCookieId] = useState(() => {
    if (typeof document === "undefined") return "";
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${ACTIVE_BRAND_COOKIE}=([^;]*)`),
    );
    return match ? decodeURIComponent(match[1]) : "";
  });

  const selected = idFromPath || cookieId;

  if (brands.length === 0) {
    return (
      <div>
        <Label>Brand</Label>
        <Link
          href="/brands/new"
          onClick={onNavigate}
          className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          Add your first brand
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Label>Brand</Label>
      <div className="relative mt-1.5">
        <select
          aria-label="Switch brand"
          value={selected}
          onChange={(e) => {
            const value = e.target.value;
            // Persisted in a cookie so the calendar, quality check and asset
            // pages scope to this brand too — they are server-rendered and
            // have no other way to know what the sidebar selected.
            document.cookie = `${ACTIVE_BRAND_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=31536000; SameSite=Lax`;
            setCookieId(value);
            onNavigate?.();
            if (value === "") {
              router.push("/brands");
            } else {
              router.push(`/brands/${value}`);
            }
            // Re-render the server components that read the cookie.
            router.refresh();
          }}
          className="w-full appearance-none rounded-lg border border-line bg-surface-2 py-2 pl-2.5 pr-8 text-sm text-fg transition-colors hover:bg-surface-3 focus:border-accent focus:outline-none"
        >
          <option value="">All brands</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </div>
      <Link
        href="/brands/new"
        onClick={onNavigate}
        className="mt-2 inline-flex text-xs font-medium text-fg-3 transition-colors hover:text-accent"
      >
        + New brand
      </Link>
    </div>
  );
}
