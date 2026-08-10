import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/app-paths";

// Image-generation jobs for workflow 6 / Stream A (static images via Canva).
//
// The Next.js app CANNOT call Canva itself: Canva is reached through an MCP
// connector that lives in a Claude session, not over HTTP from this server.
// So this is a queue. The app writes a job here; a Claude session picks up
// pending jobs, generates + exports the design via Canva MCP, downloads the
// PNG into public/generated/, and writes the result back onto the job.


const JOBS_FILE = path.join(dataDir(), "image-jobs.json");

/**
 * "pending" means queued for Canva — waiting on a human to run it in a Claude
 * session. "generating" means a direct provider is actively working on it
 * right now. They look the same to a user otherwise, but only one of them is
 * waiting on a person, so the UI must not tell you to go do something when
 * nothing is required of you.
 */
export type ImageJobStatus = "pending" | "generating" | "complete" | "failed";

export type ImageJobResult = {
  /** Which path produced this — governs what the UI can offer (e.g. an "Edit
   *  in Canva" link only makes sense for a Canva-produced result, and a
   *  Pollinations result needs its watermark/testing-only disclosure shown).
   *  Optional only for jobs created before this field existed; treat missing
   *  as "canva". */
  provider?: "canva" | "openai" | "pollinations";
  /** Canva-only — absent for direct-generation results. */
  designId?: string;
  title?: string;
  editUrl?: string;
  viewUrl?: string;
  /** Path under /public, e.g. "/generated/MON_001.png" — served by Next. */
  localPath: string;
  width: number;
  height: number;
  exportedAt: string;
};

export type ImageJob = {
  id: string;
  /**
   * Optional only for backward compatibility with jobs created before
   * multi-brand support existed. Bucket-generated post ids (e.g. "MON_001")
   * are day+index based, not globally unique — two different brands' Monday
   * posts collide on the same id. Every new job sets this; lookups that need
   * to be request-scoped must filter on it rather than trust postId alone.
   */
  requestId?: string;
  postId: string;
  day: string;
  topic: string;
  /** The prompt handed to Canva. Derived from the creative brief. */
  prompt: string;
  designType: string;
  status: ImageJobStatus;
  createdAt: string;
  result?: ImageJobResult;
  error?: string;
};

async function ensureDataDir() {
  await fs.mkdir(dataDir(), { recursive: true });
}

export async function listImageJobs(): Promise<ImageJob[]> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(JOBS_FILE, "utf-8");
    return JSON.parse(raw) as ImageJob[];
  } catch {
    return [];
  }
}

export async function saveImageJobs(jobs: ImageJob[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), "utf-8");
}

export async function createImageJob(
  input: Pick<ImageJob, "postId" | "day" | "topic" | "prompt" | "designType" | "requestId">
): Promise<ImageJob> {
  return recordImageJob({ ...input, status: "pending" });
}

/**
 * The general form `createImageJob` wraps: any status, with a result already
 * attached. Direct-generation providers (OpenAI) call this to record a
 * finished or failed job immediately — there is no queue step to go through
 * when nothing needs a human to complete it in a separate session.
 */
export async function recordImageJob(
  input: Pick<ImageJob, "postId" | "day" | "topic" | "prompt" | "designType" | "requestId"> & {
    status: ImageJobStatus;
    result?: ImageJobResult;
    error?: string;
  },
): Promise<ImageJob> {
  const jobs = await listImageJobs();
  const job: ImageJob = {
    ...input,
    id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  jobs.unshift(job);
  await saveImageJobs(jobs);
  return job;
}

/** Replace an existing job in place — used to move it from generating to done. */
export async function updateImageJob(
  id: string,
  patch: Partial<Pick<ImageJob, "status" | "result" | "error">>,
): Promise<void> {
  const jobs = await listImageJobs();
  const job = jobs.find((j) => j.id === id);
  if (!job) return;
  Object.assign(job, patch);
  await saveImageJobs(jobs);
}

/** Latest job per post, so the UI can show the most recent attempt. */
export async function latestJobByPost(): Promise<Record<string, ImageJob>> {
  const jobs = await listImageJobs();
  const byPost: Record<string, ImageJob> = {};
  for (const job of jobs) {
    const existing = byPost[job.postId];
    if (!existing || job.createdAt > existing.createdAt) {
      byPost[job.postId] = job;
    }
  }
  return byPost;
}

/**
 * Same as `latestJobByPost`, but scoped to one research request. Required
 * once more than one brand exists, since post ids are not globally unique —
 * see the note on `ImageJob.requestId`.
 */
export async function latestJobByPostForRequest(
  requestId: string,
): Promise<Record<string, ImageJob>> {
  const jobs = await listImageJobs();
  const byPost: Record<string, ImageJob> = {};
  for (const job of jobs) {
    if (job.requestId !== requestId) continue;
    const existing = byPost[job.postId];
    if (!existing || job.createdAt > existing.createdAt) {
      byPost[job.postId] = job;
    }
  }
  return byPost;
}
