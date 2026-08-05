import { promises as fs } from "fs";
import path from "path";

/**
 * Persisted Quality Check decisions (workflow 7).
 *
 * Previously the QC screen held approvals in React state only, so every
 * decision was silently lost on refresh — the screen looked like it worked
 * and didn't. Decisions are the gate that releases a post to publishing, so
 * they have to outlive the page.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const QC_FILE = path.join(DATA_DIR, "qc-decisions.json");

export type QCStatus = "approved" | "revision_requested" | "pending";

export type QCDecision = {
  postId: string;
  status: QCStatus;
  feedback?: string;
  /** Checklist state, keyed "visual:0" / "copy:3". Omitted entries = untouched. */
  checks?: Record<string, boolean>;
  decidedAt: string;
};

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function listDecisions(): Promise<Record<string, QCDecision>> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(QC_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, QCDecision>;
  } catch {
    return {};
  }
}

export async function saveDecision(decision: QCDecision): Promise<void> {
  const all = await listDecisions();
  all[decision.postId] = decision;
  await fs.writeFile(QC_FILE, JSON.stringify(all, null, 2), "utf-8");
}

/** Merge one post's checklist toggle without disturbing its status. */
export async function saveChecks(
  postId: string,
  checks: Record<string, boolean>
): Promise<void> {
  const all = await listDecisions();
  const existing = all[postId];
  all[postId] = {
    postId,
    status: existing?.status ?? "pending",
    feedback: existing?.feedback,
    checks: { ...(existing?.checks ?? {}), ...checks },
    decidedAt: new Date().toISOString(),
  };
  await fs.writeFile(QC_FILE, JSON.stringify(all, null, 2), "utf-8");
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
