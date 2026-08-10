"use server";

import { revalidatePath } from "next/cache";
import { getRequest, saveResult, setRequestStatus } from "@/lib/research-store";
import { runCompetitorResearch } from "@/lib/pipeline/research";
import { startJob, updateJob, isRunning, getJob } from "@/lib/pipeline/jobs";
import { isLlmConfigured } from "@/lib/llm";

/**
 * Kick off competitor research and return immediately.
 *
 * The work takes minutes (web fetches plus a multi-minute model call), which
 * is far longer than any request should be held open. So the action starts
 * the job, writes progress to disk, and returns — the page polls for status.
 */
export async function startResearch(requestId: string) {
  if (!isLlmConfigured()) {
    throw new Error("LLM_API_KEY is not set — add it to web/.env.local first.");
  }

  const request = await getRequest(requestId);
  if (!request) throw new Error(`Unknown request: ${requestId}`);

  if (await isRunning(requestId)) {
    return { started: false, reason: "already running" as const };
  }

  await startJob(requestId, "competitor-research");
  await setRequestStatus(requestId, "researching");

  // Deliberately not awaited: this is the long-running work, and awaiting it
  // would hold the action open for minutes. Errors are captured onto the job
  // record instead of surfacing as an unhandled rejection.
  void (async () => {
    try {
      const result = await runCompetitorResearch(request, (message) =>
        updateJob(requestId, { message })
      );
      await saveResult(result);
      await setRequestStatus(requestId, "complete");
      await updateJob(requestId, {
        status: "complete",
        message: `Analysed ${result.competitors.length} competitors`,
        finishedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await setRequestStatus(requestId, "pending");
      await updateJob(requestId, {
        status: "failed",
        message: "Research failed",
        error: message,
        finishedAt: new Date().toISOString(),
      });
    }
  })();

  revalidatePath(`/research/${requestId}`);
  return { started: true as const };
}

/** Polled by the client while a job is in flight. */
export async function pollResearch(requestId: string) {
  const [job, request] = await Promise.all([
    getJob(requestId),
    getRequest(requestId),
  ]);
  return {
    status: job?.status ?? null,
    message: job?.message ?? "",
    error: job?.error,
    requestStatus: request?.status ?? null,
  };
}
