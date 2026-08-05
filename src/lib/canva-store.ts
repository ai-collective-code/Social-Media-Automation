import { promises as fs } from "fs";
import path from "path";

// Image-generation jobs for workflow 6 / Stream A (static images via Canva).
//
// The Next.js app CANNOT call Canva itself: Canva is reached through an MCP
// connector that lives in a Claude session, not over HTTP from this server.
// So this is a queue. The app writes a job here; a Claude session picks up
// pending jobs, generates + exports the design via Canva MCP, downloads the
// PNG into public/generated/, and writes the result back onto the job.

const DATA_DIR = path.join(process.cwd(), "data");
const JOBS_FILE = path.join(DATA_DIR, "image-jobs.json");

export type ImageJobStatus = "pending" | "complete" | "failed";

export type ImageJobResult = {
  designId: string;
  title: string;
  editUrl: string;
  viewUrl: string;
  /** Path under /public, e.g. "/generated/MON_001.png" — served by Next. */
  localPath: string;
  width: number;
  height: number;
  exportedAt: string;
};

export type ImageJob = {
  id: string;
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
  await fs.mkdir(DATA_DIR, { recursive: true });
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
  input: Pick<ImageJob, "postId" | "day" | "topic" | "prompt" | "designType">
): Promise<ImageJob> {
  const jobs = await listImageJobs();
  const job: ImageJob = {
    ...input,
    id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  jobs.unshift(job);
  await saveImageJobs(jobs);
  return job;
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
