"use client";

import { useState, useTransition } from "react";
import {
  Badge,
  Button,
  Callout,
  Card,
  EmptyState,
  Field,
  Label,
  ProgressBar,
  SectionHeading,
  Textarea,
  cx,
  type Tone,
} from "@/components/ui";
import { qcStatusMeta } from "@/lib/mock-data";
import type { CalendarPost } from "@/lib/active-brand";
import type { QCDecision, QCStatus } from "@/lib/qc-store";
import { decidePost, toggleCheck } from "./actions";

/**
 * Review criteria.
 *
 * Fixed lists rather than per-post data: these are the reviewer's standard
 * checks, and the pipeline doesn't generate them. The mock data used to carry
 * its own per-post labels, which made them look derived when they weren't.
 */
const VISUAL_CHECKS = [
  "On-brand colours and typography",
  "Text is legible at phone size",
  "Correct aspect ratio for the platform",
  "No spelling errors in on-image text",
  "Respects the brand's guardrails",
];

const COPY_CHECKS = [
  "Hook lands in the first line",
  "Caption matches brand voice",
  "Call to action is clear",
  "Hashtags are relevant, not padding",
  "No claims the brand can't make",
];

/**
 * Status → semantic tone. `qcStatusMeta` still owns the labels, but its
 * `className` is dark-only, so colour is resolved through the token tones here
 * instead. Approved is `good`, revision is `warn` (a note, not a failure).
 */
const STATUS_TONE: Record<QCStatus, Tone> = {
  approved: "good",
  revision_requested: "warn",
  pending: "neutral",
};

export default function QualityCheckClient({
  posts,
  requestId,
  decisions,
}: {
  posts: CalendarPost[];
  requestId: string;
  decisions: Record<string, QCDecision>;
}) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  const post = posts[index];
  // Decisions are stored per request, since post ids repeat across brands.
  const decision = decisions[`${requestId}:${post.id}`];

  const status: QCStatus = decision?.status ?? post.qcStatus;
  const meta = qcStatusMeta[status];
  const savedFeedback = decision?.feedback ?? post.qcFeedback;

  function checkState(kind: "visual" | "copy", i: number): boolean | null {
    const key = `${kind}:${i}`;
    if (decision?.checks && key in decision.checks) return decision.checks[key];
    return null;
  }

  function decide(next: QCStatus) {
    startTransition(async () => {
      await decidePost(
        post.id,
        next,
        next === "revision_requested" ? feedback : undefined,
        requestId,
      );
      setFeedback("");
    });
  }

  function flip(kind: "visual" | "copy", i: number) {
    const current = checkState(kind, i);
    startTransition(async () => {
      await toggleCheck(post.id, `${kind}:${i}`, current !== true, requestId);
    });
  }

  const resolveStatus = (p: CalendarPost) =>
    decisions[`${requestId}:${p.id}`]?.status ?? p.qcStatus;

  const approvedCount = posts.filter((p) => resolveStatus(p) === "approved").length;

  const resolved = posts.map(resolveStatus);
  const revisionCount = resolved.filter((s) => s === "revision_requested").length;
  const pendingCount = resolved.filter((s) => s === "pending").length;
  const approvedPct = posts.length ? (approvedCount / posts.length) * 100 : 0;

  /** Pass/fail tally for one checklist, read straight off `checkState`. */
  function tally(kind: "visual" | "copy", total: number) {
    let pass = 0;
    let fail = 0;
    for (let i = 0; i < total; i++) {
      const s = checkState(kind, i);
      if (s === true) pass++;
      else if (s === false) fail++;
    }
    return { pass, fail, total };
  }

  const visualTally = tally("visual", VISUAL_CHECKS.length);
  const copyTally = tally("copy", COPY_CHECKS.length);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      {/* ----------------------------- list rail -----------------------------
          Above the detail on small screens as a horizontally scrollable strip,
          a sticky vertical rail from `lg` up. Never a squashed two-column. */}
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <Card>
          <SectionHeading
            title="Review progress"
            subtitle={`${approvedCount} of ${posts.length} approved`}
          />
          <ProgressBar
            value={approvedPct}
            tone="good"
            label={`${approvedCount} of ${posts.length} posts approved`}
            className="mt-3"
          />
          <p className="mt-2.5 text-xs text-fg-3">
            {revisionCount} awaiting revision · {pendingCount} not yet reviewed
          </p>
        </Card>

        <p className="px-1 pt-1">
          <Label>All posts</Label>
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 lg:max-h-[58vh] lg:flex-col lg:overflow-y-auto lg:pb-1">
          {posts.map((p, i) => {
            const s = resolved[i];
            const m = qcStatusMeta[s];
            const selected = i === index;
            return (
              <button
                key={p.id}
                type="button"
                aria-current={selected ? "true" : undefined}
                onClick={() => setIndex(i)}
                className={cx(
                  "w-56 shrink-0 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors lg:w-full",
                  selected
                    ? "border-accent-border bg-accent-soft"
                    : "border-line bg-surface-2 hover:border-line-strong hover:bg-surface-3"
                )}
              >
                <p className={cx("font-medium", selected ? "text-accent" : "text-fg")}>{p.day}</p>
                <p className="truncate text-xs text-fg-3">{p.topic}</p>
                <Badge tone={STATUS_TONE[s]} className="mt-1.5">
                  {m.label}
                </Badge>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ---------------------------- detail pane ---------------------------- */}
      <div className="min-w-0 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-fg-3">
              {post.day} · {post.time} · {post.platform}
            </p>
            <h2 className="text-lg font-semibold text-fg">{post.topic}</h2>
          </div>
          {/* Announces the saved decision to screen readers after an
              approve / request-revision / reset round-trip. */}
          <div
            aria-live="polite"
            role="status"
            className="flex shrink-0 items-center gap-2"
          >
            {pending && <span className="text-xs text-fg-3">Saving…</span>}
            <Badge tone={STATUS_TONE[status]}>{meta.label}</Badge>
            <span className="sr-only">
              {post.day} — {meta.label}
              {savedFeedback ? `. Feedback on record: ${savedFeedback}` : ""}
            </span>
          </div>
        </div>

        <Card>
          <SectionHeading
            title="1. Visual asset review"
            subtitle={post.isVideo ? "Video treatment" : "Static image"}
            action={
              <Badge
                tone={
                  visualTally.fail > 0
                    ? "warn"
                    : visualTally.pass === visualTally.total
                    ? "good"
                    : "neutral"
                }
              >
                {visualTally.pass}/{visualTally.total} pass
              </Badge>
            }
          />

          <div className="my-4">
            <EmptyState title="No preview on this screen" icon={<AssetIcon />}>
              <span className="block">
                Generate the image from the brief on the research page, then review the exported
                file in the Asset Library and record the result below.
              </span>
              <span className="mt-2 block text-xs">
                Intended format: {post.isVideo ? "video" : "static image"} for {post.platform}.
              </span>
            </EmptyState>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {VISUAL_CHECKS.map((label, i) => (
              <CheckRow
                key={label}
                label={label}
                passed={checkState("visual", i)}
                disabled={pending}
                onToggle={() => flip("visual", i)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeading
            title="2. Copy review"
            action={
              <Badge
                tone={
                  copyTally.fail > 0
                    ? "warn"
                    : copyTally.pass === copyTally.total
                    ? "good"
                    : "neutral"
                }
              >
                {copyTally.pass}/{copyTally.total} pass
              </Badge>
            }
          />

          <dl className="my-4 space-y-3">
            <div>
              <dt>
                <Label>Hook</Label>
              </dt>
              <dd className="mt-1 text-sm font-medium text-fg">
                {post.hook ?? <span className="text-fg-3">No hook — brief not generated</span>}
              </dd>
            </div>
            <div>
              <dt>
                <Label>Caption</Label>
              </dt>
              <dd className="mt-1 whitespace-pre-line text-sm text-fg-2">
                {post.caption ?? (
                  <span className="text-fg-3">No caption — brief not generated for this post</span>
                )}
              </dd>
            </div>
            {post.hashtags && post.hashtags.length > 0 && (
              <div>
                <dt>
                  <Label>Hashtags</Label>
                </dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {post.hashtags.map((tag) => (
                    <Badge key={tag} tone="run" className="font-mono">
                      #{tag}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {COPY_CHECKS.map((label, i) => (
              <CheckRow
                key={label}
                label={label}
                passed={checkState("copy", i)}
                disabled={pending}
                onToggle={() => flip("copy", i)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <SectionHeading title="Decision" subtitle="Saved to disk — survives a refresh" />

          {savedFeedback && (
            <Callout tone="warn" title="Feedback on record" className="mt-4">
              {savedFeedback}
            </Callout>
          )}

          <Field
            label="Revision feedback"
            hint="Sent with “Request revision”. Optional."
            htmlFor="qc-feedback"
            className="mt-4"
          >
            <Textarea
              id="qc-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Feedback for revision (optional)"
              rows={2}
            />
          </Field>

          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <Button variant="primary" loading={pending} onClick={() => decide("approved")}>
              Approve
            </Button>
            {/* Requesting a revision is a warning, not a destructive action —
                `danger` is reserved for red/destructive. */}
            <Button
              variant="warning"
              loading={pending}
              onClick={() => decide("revision_requested")}
            >
              Request revision
            </Button>
            {status !== "pending" && (
              <Button variant="ghost" loading={pending} onClick={() => decide("pending")}>
                Reset
              </Button>
            )}
          </div>
        </Card>

        <nav className="flex items-center justify-between gap-3" aria-label="Post navigation">
          <Button
            variant="secondary"
            size="sm"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            ← Previous
          </Button>
          <span className="text-center text-xs text-fg-3 sm:text-sm">
            {post.day} ({index + 1} / {posts.length}) · {approvedCount} approved
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={index === posts.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next →
          </Button>
        </nav>
      </div>
    </div>
  );
}

function AssetIcon() {
  return (
    <svg
      className="h-7 w-7"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
      <path d="M2.5 9h19M7 4.5v4.5M17 4.5v4.5" />
      <path d="m10.5 12.75 4 2.25-4 2.25z" />
    </svg>
  );
}

/**
 * Tri-state checklist toggle. Pass / fail / unset are told apart by shape and
 * glyph (filled circle + ✓, square + ✕, dashed circle + –) as well as colour,
 * with the state also spelled out in words.
 */
function CheckRow({
  label,
  passed,
  disabled,
  onToggle,
}: {
  label: string;
  passed: boolean | null;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const isPass = passed === true;
  const isFail = passed === false;
  const stateWord = isPass ? "Pass" : isFail ? "Fail" : "Unset";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isPass}
      title={`${label} — ${stateWord}. Click to toggle.`}
      className={cx(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        isPass
          ? "border-good-border bg-good-soft text-fg hover:border-good"
          : isFail
          ? "border-warn-border bg-warn-soft text-fg hover:border-warn"
          : "border-line bg-surface-2 text-fg-2 hover:border-line-strong hover:bg-surface-3 hover:text-fg"
      )}
    >
      <span
        aria-hidden
        className={cx(
          "flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-bold leading-none",
          isPass
            ? "rounded-full border-good bg-good text-fg-inverse"
            : isFail
            ? "rounded-[5px] border-warn bg-warn text-fg-inverse"
            : "rounded-full border-dashed border-line-strong text-fg-3"
        )}
      >
        {isPass ? "✓" : isFail ? "✕" : "–"}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      <span
        className={cx(
          "shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]",
          isPass ? "text-good" : isFail ? "text-warn" : "text-fg-3"
        )}
      >
        {stateWord}
      </span>
    </button>
  );
}
