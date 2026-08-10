"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startRun, pollRun } from "../actions";
import { RUN_STAGES, STAGE_LABEL, type Run, type RunStage } from "@/lib/run-types";
import { Button, Card, Badge, ProgressBar, Callout, Label, Spinner, cx } from "@/components/ui";

type Poll = Awaited<ReturnType<typeof pollRun>>;

const POLL_MS = 4000;

function elapsedLabel(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

const PROVIDER_LABEL: Record<string, string> = {
  anthropic: "Claude",
  "openai-compatible": "OpenAI-compatible provider",
  none: "No model configured",
};

export default function RunPanel({
  brandId,
  latestRun,
  provider = "none",
}: {
  brandId: string;
  latestRun?: Run;
  provider?: "anthropic" | "openai-compatible" | "none";
}) {
  const router = useRouter();

  const initiallyLive = latestRun?.status === "queued" || latestRun?.status === "running";
  const [runId, setRunId] = useState<string | null>(initiallyLive ? latestRun!.id : null);
  const [poll, setPoll] = useState<Poll>(
    latestRun
      ? {
          status: latestRun.status,
          stage: latestRun.stage ?? null,
          completedStages: latestRun.completedStages,
          message: latestRun.message,
          error: latestRun.error ?? null,
          requestId: latestRun.requestId ?? null,
          competitors: latestRun.competitors ?? null,
          queuePosition: null,
        }
      : null,
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const live = poll?.status === "queued" || poll?.status === "running";

  // Elapsed counter, reset whenever a run becomes live.
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!live) {
      startedAtRef.current = null;
      return;
    }
    if (startedAtRef.current === null) {
      const base = latestRun?.startedAt ?? latestRun?.queuedAt;
      startedAtRef.current = base && latestRun?.id === runId ? new Date(base).getTime() : Date.now();
    }
    const tick = () =>
      setElapsed(Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [live, latestRun, runId]);

  // Poll while a run is queued or running; refresh the page once it lands so
  // the server-rendered results appear.
  useEffect(() => {
    if (!runId || !live) return;
    let cancelled = false;
    const t = setInterval(async () => {
      const next = await pollRun(runId);
      if (cancelled || !next) return;
      setPoll(next);
      if (next.status === "complete" || next.status === "failed") {
        router.refresh();
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [runId, live, router]);

  const begin = useCallback(async () => {
    setStarting(true);
    setStartError(null);
    try {
      const res = await startRun(brandId);
      if (!res.started) {
        setStartError(res.reason);
        return;
      }
      setRunId(res.runId);
      startedAtRef.current = Date.now();
      setPoll({
        status: "queued",
        stage: null,
        completedStages: [],
        message: "Waiting to start",
        error: null,
        requestId: null,
        competitors: null,
        queuePosition: null,
      });
      router.refresh();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }, [brandId, router]);

  const doneCount = poll?.completedStages.length ?? 0;
  const pct = Math.round((doneCount / RUN_STAGES.length) * 100);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Full process</h2>
          <p className="mt-0.5 text-xs text-fg-3">
            Finds competitors, then runs all five stages in order. Makes billed model calls.
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-fg-3">
            <Label>Model</Label>
            <span className={provider === "none" ? "text-bad" : "text-fg-2"}>
              {PROVIDER_LABEL[provider]}
            </span>
          </p>
        </div>
        {!live && (
          <Button onClick={begin} loading={starting}>
            {poll?.status === "complete" || poll?.status === "failed"
              ? "Start another run"
              : "Start full process"}
          </Button>
        )}
      </div>

      {startError && (
        <Callout tone="bad" className="mt-4">
          {startError}
        </Callout>
      )}

      {poll && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {live && <Spinner className="h-3.5 w-3.5 text-run" />}
              <Badge
                tone={
                  poll.status === "complete"
                    ? "good"
                    : poll.status === "failed"
                      ? "bad"
                      : poll.status === "running"
                        ? "run"
                        : "neutral"
                }
              >
                {poll.status === "queued" && poll.queuePosition
                  ? `Queued — position ${poll.queuePosition}`
                  : poll.status}
              </Badge>
              <span className="text-xs text-fg-3">
                {doneCount} of {RUN_STAGES.length} stages
              </span>
            </div>
            {live && <span className="tabular text-xs text-fg-3">{elapsedLabel(elapsed)}</span>}
          </div>

          <ProgressBar
            className="mt-3"
            value={pct}
            tone={poll.status === "failed" ? "bad" : poll.status === "complete" ? "good" : "run"}
            label={`Run progress: ${doneCount} of ${RUN_STAGES.length} stages complete`}
          />

          {/* aria-live so the 25-minute wait is announced, not just animated. */}
          <p aria-live="polite" className="mt-3 text-sm text-fg-2">
            {poll.message}
          </p>

          {poll.error && (
            <Callout tone="bad" className="mt-3">
              <span role="alert">{poll.error}</span>
            </Callout>
          )}

          <ol className="mt-4 grid gap-1.5">
            {RUN_STAGES.map((s, i) => (
              <StageRow
                key={s}
                index={i + 1}
                stage={s}
                done={poll.completedStages.includes(s)}
                current={poll.stage === s && poll.status === "running"}
                failed={poll.status === "failed" && poll.stage === s}
              />
            ))}
          </ol>

          {poll.competitors && poll.competitors.length > 0 && (
            <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
              <Label>Competitors found</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {poll.competitors.map((c) => (
                  <Badge key={c.name} tone="neutral">
                    {c.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {poll.requestId && (
            <Link
              href={`/research/${poll.requestId}`}
              className="mt-4 inline-flex text-sm font-medium text-accent hover:underline"
            >
              View full results →
            </Link>
          )}
        </div>
      )}
    </Card>
  );
}

function StageRow({
  index,
  stage,
  done,
  current,
  failed,
}: {
  index: number;
  stage: RunStage;
  done: boolean;
  current: boolean;
  failed: boolean;
}) {
  const tone = failed ? "bad" : done ? "good" : current ? "run" : "neutral";
  const glyph = failed ? "×" : done ? "✓" : current ? "▶" : "○";
  return (
    <li
      className={cx(
        "flex items-center gap-3 rounded-lg border px-3 py-2 text-sm",
        current
          ? "border-run-border bg-run-soft"
          : done
            ? "border-line bg-surface-2"
            : failed
              ? "border-bad-border bg-bad-soft"
              : "border-line",
      )}
    >
      <span className="tabular font-mono text-[10px] text-fg-3">
        {String(index).padStart(2, "0")}
      </span>
      <span
        aria-hidden
        className={cx(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
          tone === "good" && "border-good-border text-good",
          tone === "run" && "border-run-border text-run",
          tone === "bad" && "border-bad-border text-bad",
          tone === "neutral" && "border-line text-fg-3",
        )}
      >
        {glyph}
      </span>
      <span className={cx("flex-1", done || current ? "text-fg" : "text-fg-3")}>
        {STAGE_LABEL[stage]}
      </span>
      <span className="text-xs text-fg-3">
        {failed ? "Failed" : done ? "Done" : current ? "Running" : "Waiting"}
      </span>
    </li>
  );
}
