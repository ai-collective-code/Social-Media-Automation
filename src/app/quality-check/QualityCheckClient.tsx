"use client";

import { useState, useTransition } from "react";
import { Card, Badge, Button } from "@/components/ui";
import { qcStatusMeta, type Post } from "@/lib/mock-data";
import type { QCDecision, QCStatus } from "@/lib/qc-store";
import { decidePost, toggleCheck } from "./actions";

export default function QualityCheckClient({
  posts,
  decisions,
}: {
  posts: Post[];
  decisions: Record<string, QCDecision>;
}) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState("");
  const [pending, startTransition] = useTransition();

  const post = posts[index];
  const decision = decisions[post.id];

  // Persisted decision wins; the seeded value in mock-data is only a fallback
  // for posts nobody has reviewed yet.
  const status: QCStatus = decision?.status ?? post.qc.status;
  const meta = qcStatusMeta[status];
  const savedFeedback = decision?.feedback ?? post.qc.feedback;

  function checkState(kind: "visual" | "copy", i: number): boolean | null {
    const key = `${kind}:${i}`;
    if (decision?.checks && key in decision.checks) return decision.checks[key];
    const seeded =
      kind === "visual" ? post.qc.visualChecks[i]?.passed : post.qc.copyChecks[i]?.passed;
    return seeded ?? null;
  }

  function decide(next: QCStatus) {
    startTransition(async () => {
      await decidePost(post.id, next, next === "revision_requested" ? feedback : undefined);
      setFeedback("");
    });
  }

  function flip(kind: "visual" | "copy", i: number) {
    const current = checkState(kind, i);
    startTransition(async () => {
      await toggleCheck(post.id, `${kind}:${i}`, current !== true);
    });
  }

  const approvedCount = posts.filter(
    (p) => (decisions[p.id]?.status ?? p.qc.status) === "approved"
  ).length;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">
              {post.day} · {post.time} · {post.platform}
            </p>
            <h2 className="text-lg font-semibold text-white">{post.topic}</h2>
          </div>
          <div className="flex items-center gap-2">
            {pending && <span className="text-xs text-slate-500">Saving…</span>}
            <Badge className={meta.className}>{meta.label}</Badge>
          </div>
        </div>

        <Card>
          <p className="mb-3 text-sm font-semibold text-white">1. Visual asset review</p>
          <div className="mb-4 flex aspect-video items-center justify-center rounded-lg border border-dashed border-white/15 bg-slate-950/60 text-sm text-slate-500">
            {post.videoAsset ?? post.imageAsset ?? "No asset"} (preview placeholder)
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {post.qc.visualChecks.map((check, i) => (
              <CheckRow
                key={check.label}
                label={check.label}
                passed={checkState("visual", i)}
                disabled={pending}
                onToggle={() => flip("visual", i)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-semibold text-white">2. Copy review</p>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Hook</p>
          <p className="mb-3 text-sm text-slate-200">{post.hook}</p>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Caption</p>
          <p className="mb-3 text-sm text-slate-300">{post.caption}</p>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-500">Hashtags</p>
          <p className="mb-4 text-sm text-sky-300">{post.hashtags.join(" ")}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {post.qc.copyChecks.map((check, i) => (
              <CheckRow
                key={check.label}
                label={check.label}
                passed={checkState("copy", i)}
                disabled={pending}
                onToggle={() => flip("copy", i)}
              />
            ))}
          </div>
        </Card>

        <Card>
          <p className="mb-3 text-sm font-semibold text-white">Decision</p>
          {savedFeedback && (
            <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
              Feedback on record: {savedFeedback}
            </p>
          )}
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback for revision (optional)"
            className="mb-3 w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
            rows={2}
          />
          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={pending} onClick={() => decide("approved")}>
              Approve
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => decide("revision_requested")}
            >
              Request revision
            </Button>
            {status !== "pending" && (
              <Button variant="ghost" disabled={pending} onClick={() => decide("pending")}>
                Reset
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Decisions are saved to disk and survive a refresh.
          </p>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="ghost" disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>
            ← Previous
          </Button>
          <span className="text-sm text-slate-500">
            {post.day} ({index + 1} / {posts.length}) · {approvedCount} approved
          </span>
          <Button
            variant="ghost"
            disabled={index === posts.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next →
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-white">All posts</p>
        {posts.map((p, i) => {
          const s = decisions[p.id]?.status ?? p.qc.status;
          const m = qcStatusMeta[s];
          return (
            <button
              key={p.id}
              onClick={() => setIndex(i)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                i === index
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-white/10 bg-white/[0.02] hover:bg-white/5"
              }`}
            >
              <p className="font-medium text-white">{p.day}</p>
              <p className="truncate text-xs text-slate-400">{p.topic}</p>
              <Badge className={`mt-1 ${m.className}`}>{m.label}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
  return (
    <button
      onClick={onToggle}
      disabled={disabled}
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/5 disabled:opacity-60"
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
          passed === true
            ? "border-emerald-400 bg-emerald-400 text-slate-950"
            : passed === false
            ? "border-amber-400 bg-amber-400 text-slate-950"
            : "border-slate-600 text-transparent"
        }`}
      >
        {passed === true ? "✓" : passed === false ? "✕" : ""}
      </span>
      {label}
    </button>
  );
}
