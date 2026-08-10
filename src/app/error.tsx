"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";

// Next.js 16 passes `retry` to error boundaries (not `reset`).
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-line bg-canvas-raised p-6">
        <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-bad-border bg-bad-soft text-bad">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-4 w-4">
            <path strokeLinecap="round" d="M12 8v5m0 3.5v.5" />
            <circle cx="12" cy="12" r="9" />
          </svg>
        </div>
        <h1 className="text-base font-semibold text-fg">This page didn&apos;t load</h1>
        <p className="mt-1.5 text-sm text-fg-2">
          {error.message || "Something failed while rendering this page."}
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-fg-3">Reference: {error.digest}</p>
        )}
        <div className="mt-5 flex gap-2">
          <Button onClick={() => retry()}>Try again</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      </div>
    </div>
  );
}
