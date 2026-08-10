import { readJson, writeJson, newId } from "@/lib/json-store";
import type { Run, RunStage } from "@/lib/run-types";

/**
 * A Run is one execution of the full pipeline for one brand.
 *
 * Runs are queued and processed ONE AT A TIME on purpose. The web-search layer
 * keeps a process-global circuit breaker that trips on the query burst a single
 * run produces (~18 queries); two runs at once would reliably block each other
 * and return empty research that looks like "this brand has no presence".
 * Queueing is therefore a correctness requirement, not just throttling.
 *
 * `requestId` links a run to the existing ResearchRequest/result stores, so all
 * five original stages and the /research/[id] page keep working unchanged.
 */

const FILE = "runs.json";

// Client Components must import these from `@/lib/run-types` directly — this
// module touches the filesystem. Re-exported here for server-side convenience.
export type { Run, RunStage, RunStatus } from "@/lib/run-types";
export { RUN_STAGES, STAGE_LABEL } from "@/lib/run-types";

/**
 * A single stage can legitimately take ~6 minutes (the LLM per-attempt timeout
 * is 10 minutes), so the stale threshold has to exceed that or a slow-but-alive
 * run would be declared dead and started a second time.
 */
const STALE_MS = 15 * 60 * 1000;

export function isRunStale(run: Run): boolean {
  if (run.status !== "running") return false;
  const last = run.heartbeatAt ?? run.startedAt ?? run.queuedAt;
  return Date.now() - new Date(last).getTime() > STALE_MS;
}

export async function listRuns(): Promise<Run[]> {
  const runs = await readJson<Run[]>(FILE, []);
  return [...runs].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}

export async function getRun(id: string): Promise<Run | undefined> {
  const runs = await readJson<Run[]>(FILE, []);
  return runs.find((r) => r.id === id);
}

export async function listRunsForBrand(brandId: string): Promise<Run[]> {
  return (await listRuns()).filter((r) => r.brandId === brandId);
}

export async function enqueueRun(brandId: string, brandName: string): Promise<Run> {
  const runs = await readJson<Run[]>(FILE, []);
  const run: Run = {
    id: newId("run"),
    brandId,
    brandName,
    status: "queued",
    completedStages: [],
    message: "Waiting to start",
    queuedAt: new Date().toISOString(),
  };
  runs.push(run);
  await writeJson(FILE, runs);
  return run;
}

export async function updateRun(id: string, patch: Partial<Run>): Promise<void> {
  const runs = await readJson<Run[]>(FILE, []);
  const run = runs.find((r) => r.id === id);
  if (!run) return;
  Object.assign(run, patch);
  await writeJson(FILE, runs);
}

/** Progress update that also refreshes the heartbeat. */
export async function reportRunProgress(id: string, message: string): Promise<void> {
  await updateRun(id, { message, heartbeatAt: new Date().toISOString() });
}

/** The run currently holding the single worker slot, if any is still alive. */
export async function activeRun(): Promise<Run | undefined> {
  const runs = await listRuns();
  return runs.find((r) => r.status === "running" && !isRunStale(r));
}

/**
 * Take the oldest queued run and mark it running, but only if the single slot
 * is free. Read-modify-write on one JSON file is not truly atomic, so this is
 * best-effort: the caller is a background worker started from a server action,
 * and a duplicate claim is additionally guarded by the per-stage job records.
 */
export async function claimNextRun(): Promise<Run | undefined> {
  const runs = await readJson<Run[]>(FILE, []);

  const busy = runs.some((r) => r.status === "running" && !isRunStale(r));
  if (busy) return undefined;

  // Reclaim abandoned runs so a killed dev server doesn't strand them forever.
  for (const r of runs) {
    if (r.status === "running" && isRunStale(r)) {
      r.status = "failed";
      r.error = "The server stopped while this run was in progress.";
      r.message = "Interrupted";
      r.finishedAt = new Date().toISOString();
    }
  }

  const next = runs
    .filter((r) => r.status === "queued")
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))[0];

  if (!next) {
    await writeJson(FILE, runs);
    return undefined;
  }

  const now = new Date().toISOString();
  next.status = "running";
  next.startedAt = now;
  next.heartbeatAt = now;
  next.message = "Starting…";
  await writeJson(FILE, runs);
  return next;
}

/** 1-based position in the queue, or null if not queued. */
export async function queuePosition(id: string): Promise<number | null> {
  const runs = await listRuns();
  const queued = runs
    .filter((r) => r.status === "queued")
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  const index = queued.findIndex((r) => r.id === id);
  return index === -1 ? null : index + 1;
}
