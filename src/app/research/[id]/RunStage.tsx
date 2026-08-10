"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Callout, Dot, ProgressBar } from "@/components/ui";

/**
 * Generic version of RunResearch.tsx for workflows 2-4.5.
 *
 * Identical running/error/idle states and 4s polling loop as the original —
 * this one just takes its label and bound start/poll server actions as
 * props instead of hardcoding workflow 1, so page.tsx can reuse it for
 * Trend Analysis, Content Strategy, Content Bucketing, and Creative Director
 * without four near-duplicate components.
 */

type PollResult = { status: "running" | "complete" | "failed" | null; message: string; error?: string };

export default function RunStage({
  label,
  initiallyRunning,
  hasResult,
  llmReady,
  start,
  poll,
}: {
  label: string;
  initiallyRunning: boolean;
  hasResult: boolean;
  llmReady: boolean;
  start: () => Promise<{ started: boolean; reason?: string }>;
  poll: () => Promise<PollResult>;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(initiallyRunning);
  const [message, setMessage] = useState(initiallyRunning ? "Working…" : "");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    startedAt.current = Date.now();

    const tick = setInterval(() => {
      const began = startedAt.current;
      if (began !== null) setElapsed(Math.round((Date.now() - began) / 1000));
    }, 1000);

    const pollInterval = setInterval(async () => {
      try {
        const s = await poll();
        if (s.message) setMessage(s.message);
        if (s.status === "complete") {
          setRunning(false);
          router.refresh();
        } else if (s.status === "failed") {
          setRunning(false);
          setError(s.error ?? `${label} failed`);
        }
      } catch {
        // A dropped poll is not fatal — the next tick retries.
      }
    }, 4000);

    return () => {
      clearInterval(tick);
      clearInterval(pollInterval);
    };
  }, [running, poll, router, label]);

  async function run() {
    setError(null);
    setMessage("Starting…");
    setElapsed(0);
    setRunning(true);
    try {
      await start();
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!llmReady) {
    return (
      <Callout tone="warn" title="LLM key not configured">
        Add <code className="rounded bg-surface-3 px-1 font-mono text-xs">LLM_API_KEY</code> to{" "}
        <code className="rounded bg-surface-3 px-1 font-mono text-xs">web/.env.local</code>, then
        restart the dev server.
      </Callout>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-bad-border bg-bad-soft px-4 py-3 text-sm"
        >
          <p className="font-semibold text-bad">{label} failed</p>
          <p className="mt-1 break-words text-bad">{error}</p>
        </div>
      )}

      {/* Live region is always mounted so screen readers announce progress
          updates as they arrive rather than only on first render. */}
      <div role="status" aria-live="polite">
        {running && (
          <div className="rounded-xl border border-run-border bg-run-soft px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-semibold text-run">
                <Dot tone="run" pulse />
                {label}…
              </p>
              <p className="tabular text-base font-semibold text-run">{formatElapsed(elapsed)}</p>
            </div>
            <ProgressBar
              tone="run"
              indeterminate
              className="mt-3"
              label={`${label} in progress`}
            />
            <p className="mt-2 text-sm text-run">{message}</p>
            <p className="mt-2 text-xs text-fg-3">
              Usually 3–5 minutes. Runs in the background — you can leave this page and come back.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={run} loading={running}>
          {running
            ? `${label}…`
            : hasResult
              ? `Re-run ${label.toLowerCase()}`
              : `Run ${label.toLowerCase()}`}
        </Button>
        <span className="text-xs text-fg-3">Runs in the background. Takes a few minutes.</span>
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
