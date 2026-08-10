import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/app-paths";

/**
 * Background job tracking.
 *
 * Pipeline steps take minutes, not milliseconds — a single GLM-5.2 call
 * measured 190-341s. So work cannot run inside a request/response cycle:
 * the job is started, its progress is written to disk, and the UI polls.
 *
 * State lives on disk rather than in memory because Next dev-server module
 * reloads would otherwise wipe a running job's status and strand the UI on
 * a spinner forever.
 */


const JOBS_FILE = path.join(dataDir(), "jobs.json");

export type JobStatus = "running" | "complete" | "failed";

export type Job = {
  id: string;
  kind:
    | "competitor-research"
    | "trend-analysis"
    | "content-strategy"
    | "content-bucketing"
    | "creative-director";
  status: JobStatus;
  message: string;
  startedAt: string;
  finishedAt?: string;
  error?: string;
};

/**
 * Job id for the chained workflow stages (2-4.5).
 *
 * Competitor-research keeps its existing bare-requestId job id (unchanged,
 * no migration needed). The later stages share the same requestId across up
 * to four independently-tracked jobs, so each needs its own key or starting
 * stage N would stomp stage N-1's still-relevant "complete" record.
 */
export function jobIdFor(
  requestId: string,
  stage: "trends" | "strategy" | "bucketing" | "creative"
): string {
  return `${requestId}:${stage}`;
}

async function readAll(): Promise<Record<string, Job>> {
  await fs.mkdir(dataDir(), { recursive: true });
  try {
    return JSON.parse(await fs.readFile(JOBS_FILE, "utf-8")) as Record<string, Job>;
  } catch {
    return {};
  }
}

async function writeAll(jobs: Record<string, Job>): Promise<void> {
  await fs.mkdir(dataDir(), { recursive: true });
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf-8");
}

export async function getJob(id: string): Promise<Job | undefined> {
  return (await readAll())[id];
}

export async function startJob(id: string, kind: Job["kind"]): Promise<Job> {
  const jobs = await readAll();
  const job: Job = {
    id,
    kind,
    status: "running",
    message: "Starting…",
    startedAt: new Date().toISOString(),
  };
  jobs[id] = job;
  await writeAll(jobs);
  return job;
}

export async function updateJob(id: string, patch: Partial<Job>): Promise<void> {
  const jobs = await readAll();
  const existing = jobs[id];
  if (!existing) return;
  jobs[id] = { ...existing, ...patch };
  await writeAll(jobs);
}

/** True if a job for this id is already in flight — prevents double-starts. */
export async function isRunning(id: string): Promise<boolean> {
  const job = await getJob(id);
  if (job?.status !== "running") return false;

  // A job whose process died leaves "running" on disk forever. Treat anything
  // older than 30 minutes as stale so the UI doesn't lock permanently.
  const ageMs = Date.now() - new Date(job.startedAt).getTime();
  return ageMs < 30 * 60 * 1000;
}
