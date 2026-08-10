import { readDoc, writeDoc } from "@/lib/doc-store";

/**
 * Persisted Quality Check decisions (workflow 7).
 *
 * Previously the QC screen held approvals in React state only, so every
 * decision was silently lost on refresh — the screen looked like it worked
 * and didn't. Decisions are the gate that releases a post to publishing, so
 * they have to outlive the page.
 */


const QC_KEY = "qc-decisions.json";

export type QCStatus = "approved" | "revision_requested" | "pending";

export type QCDecision = {
  postId: string;
  /**
   * The research request this decision belongs to. Optional only for
   * decisions saved before multi-brand support: bucket post ids like
   * "MON_001" are day-based and repeat across brands and runs, so without
   * this two brands' Monday posts share one decision record.
   */
  requestId?: string;
  status: QCStatus;
  feedback?: string;
  /** Checklist state, keyed "visual:0" / "copy:3". Omitted entries = untouched. */
  checks?: Record<string, boolean>;
  decidedAt: string;
};

/**
 * Storage key for one decision. Request-scoped when a request is known, and
 * the bare post id otherwise so pre-existing mock-data decisions still resolve.
 */
export function qcKeyFor(postId: string, requestId?: string): string {
  return requestId ? `${requestId}:${postId}` : postId;
}

export async function listDecisions(): Promise<Record<string, QCDecision>> {
  return readDoc<Record<string, QCDecision>>(QC_KEY, {});
}

export async function saveDecision(decision: QCDecision): Promise<void> {
  const all = await listDecisions();
  all[qcKeyFor(decision.postId, decision.requestId)] = decision;
  await writeDoc(QC_KEY, all);
}

/** Merge one post's checklist toggle without disturbing its status. */
export async function saveChecks(
  postId: string,
  checks: Record<string, boolean>,
  requestId?: string
): Promise<void> {
  const all = await listDecisions();
  const key = qcKeyFor(postId, requestId);
  const existing = all[key];
  all[key] = {
    postId,
    requestId,
    status: existing?.status ?? "pending",
    feedback: existing?.feedback,
    checks: { ...(existing?.checks ?? {}), ...checks },
    decidedAt: new Date().toISOString(),
  };
  await writeDoc(QC_KEY, all);
}

/**
 * Counts for the dashboard tracker.
 *
 * Takes each post's seeded status so it resolves exactly as the QC screen
 * does — persisted decision wins, seeded value is the fallback. Counting only
 * persisted decisions would make the dashboard disagree with the QC page.
 */
export async function qcSummary(
  seeded: { id: string; status: QCStatus }[]
) {
  const decisions = await listDecisions();
  const resolved = seeded.map((p) => decisions[p.id]?.status ?? p.status);
  const count = (s: QCStatus) => resolved.filter((r) => r === s).length;
  return {
    approved: count("approved"),
    revision: count("revision_requested"),
    pending: count("pending"),
    total: seeded.length,
  };
}
