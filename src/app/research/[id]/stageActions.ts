"use server";

import { revalidatePath } from "next/cache";
import { getRequest, getResult } from "@/lib/research-store";
import {
  getTrendResult,
  saveTrendResult,
  getStrategyResult,
  saveStrategyResult,
  getBucketResult,
  saveBucketResult,
  saveCreativeResult,
} from "@/lib/pipeline-store";
import { runTrendAnalysis } from "@/lib/pipeline/trends";
import { runContentStrategy } from "@/lib/pipeline/strategy";
import { runContentBucketing } from "@/lib/pipeline/bucketing";
import { runCreativeDirector } from "@/lib/pipeline/creative";
import { startJob, updateJob, isRunning, getJob, jobIdFor } from "@/lib/pipeline/jobs";
import { isLlmConfigured } from "@/lib/llm";

/**
 * Generic start/poll for workflows 2-4.5 — same fire-and-forget background
 * job pattern as research/actions.ts's startResearch/pollResearch, just
 * dispatched over a `stage` param instead of one hardcoded workflow.
 */

export type Stage = "trends" | "strategy" | "bucketing" | "creative";

const KIND: Record<Stage, "trend-analysis" | "content-strategy" | "content-bucketing" | "creative-director"> = {
  trends: "trend-analysis",
  strategy: "content-strategy",
  bucketing: "content-bucketing",
  creative: "creative-director",
};

const LABEL: Record<Stage, string> = {
  trends: "Trend analysis",
  strategy: "Content strategy",
  bucketing: "Content bucketing",
  creative: "Creative director",
};

export async function startStage(requestId: string, stage: Stage) {
  if (!isLlmConfigured()) {
    throw new Error("LLM_API_KEY is not set — add it to web/.env.local first.");
  }

  const request = await getRequest(requestId);
  if (!request) throw new Error(`Unknown request: ${requestId}`);

  const jobId = jobIdFor(requestId, stage);
  if (await isRunning(jobId)) {
    return { started: false, reason: "already running" as const };
  }

  await startJob(jobId, KIND[stage]);

  // Deliberately not awaited — same reasoning as startResearch: this is
  // minutes of work, far longer than any request should stay open. Errors
  // land on the job record instead of surfacing as an unhandled rejection.
  void (async () => {
    try {
      const onProgress = (message: string) => updateJob(jobId, { message });

      if (stage === "trends") {
        const competitorResult = await getResult(requestId);
        if (!competitorResult) throw new Error(`${LABEL.trends} requires a completed Competitor Analysis first.`);
        const result = await runTrendAnalysis(request, competitorResult, onProgress);
        await saveTrendResult(result);
      } else if (stage === "strategy") {
        const [competitorResult, trendResult] = await Promise.all([
          getResult(requestId),
          getTrendResult(requestId),
        ]);
        if (!competitorResult) throw new Error(`${LABEL.strategy} requires a completed Competitor Analysis first.`);
        if (!trendResult) throw new Error(`${LABEL.strategy} requires a completed Trend Analysis first.`);
        const result = await runContentStrategy(request, competitorResult, trendResult, onProgress);
        await saveStrategyResult(result);
      } else if (stage === "bucketing") {
        const strategyResult = await getStrategyResult(requestId);
        if (!strategyResult) throw new Error(`${LABEL.bucketing} requires a completed Content Strategy first.`);
        const result = await runContentBucketing(request, strategyResult, onProgress);
        await saveBucketResult(result);
      } else {
        const bucketResult = await getBucketResult(requestId);
        if (!bucketResult) throw new Error(`${LABEL.creative} requires a completed Content Bucketing first.`);
        const result = await runCreativeDirector(request, bucketResult, onProgress);
        await saveCreativeResult(result);
      }

      await updateJob(jobId, {
        status: "complete",
        message: `${LABEL[stage]} complete`,
        finishedAt: new Date().toISOString(),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await updateJob(jobId, {
        status: "failed",
        message: `${LABEL[stage]} failed`,
        error: message,
        finishedAt: new Date().toISOString(),
      });
    }
  })();

  revalidatePath(`/research/${requestId}`);
  return { started: true as const };
}

export async function pollStage(requestId: string, stage: Stage) {
  const job = await getJob(jobIdFor(requestId, stage));
  return {
    status: job?.status ?? null,
    message: job?.message ?? "",
    error: job?.error,
  };
}
