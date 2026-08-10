import { getBrand } from "@/lib/brand-store";
import {
  claimNextRun,
  reportRunProgress,
  updateRun,
  type Run,
  type RunStage,
} from "@/lib/run-store";
import {
  createRequest,
  getResult,
  saveResult,
  setRequestStatus,
  type ResearchRequest,
} from "@/lib/research-store";
import {
  getTrendResult,
  saveTrendResult,
  getStrategyResult,
  saveStrategyResult,
  getBucketResult,
  saveBucketResult,
  saveCreativeResult,
} from "@/lib/pipeline-store";
import { discoverCompetitors } from "@/lib/pipeline/discovery";
import { runCompetitorResearch } from "@/lib/pipeline/research";
import { runTrendAnalysis } from "@/lib/pipeline/trends";
import { runContentStrategy } from "@/lib/pipeline/strategy";
import { runContentBucketing } from "@/lib/pipeline/bucketing";
import { runCreativeDirector } from "@/lib/pipeline/creative";
import { startJob, updateJob, jobIdFor, type Job } from "@/lib/pipeline/jobs";
import { isLlmConfigured } from "@/lib/llm";

/**
 * Drives a whole run start-to-finish: discover competitors, then the five
 * original stages, in order.
 *
 * Only one run executes at a time — see run-store for why that's a correctness
 * requirement rather than politeness. Each stage also writes the per-stage job
 * record the manual /research/[id] buttons use, so `isRunning` there returns
 * true and a user can't launch a stage this orchestrator is already running.
 */

const JOB_KIND: Record<Exclude<RunStage, "discovery">, Job["kind"]> = {
  research: "competitor-research",
  trends: "trend-analysis",
  strategy: "content-strategy",
  bucketing: "content-bucketing",
  creative: "creative-director",
};

/** Stage 1 kept its original bare-requestId job id; later stages are suffixed. */
function jobIdForStage(requestId: string, stage: Exclude<RunStage, "discovery">): string {
  return stage === "research"
    ? requestId
    : jobIdFor(requestId, stage as "trends" | "strategy" | "bucketing" | "creative");
}

/**
 * Start the next queued run if the single slot is free.
 *
 * Safe to call often — from the enqueue action, from the UI poll, and after a
 * run finishes. Calling it when nothing is queued or something is running is a
 * no-op, which is also how a run abandoned by a killed server gets recovered.
 */
export async function tickQueue(): Promise<void> {
  const run = await claimNextRun();
  if (!run) return;

  // Not awaited: a full run is ~25 minutes, far beyond any request. Failures
  // are recorded on the run rather than thrown into a dead request context.
  void executeRun(run)
    .catch(async (e) => {
      await failRun(run.id, e);
    })
    .then(() => tickQueue());
}

async function failRun(runId: string, e: unknown): Promise<void> {
  const message = e instanceof Error ? e.message : String(e);
  await updateRun(runId, {
    status: "failed",
    error: message,
    message: "Run failed",
    finishedAt: new Date().toISOString(),
  });
}

async function executeRun(run: Run): Promise<void> {
  if (!isLlmConfigured()) {
    throw new Error("LLM_API_KEY is not set — add it to web/.env.local first.");
  }

  const brand = await getBrand(run.brandId);
  if (!brand) throw new Error(`Brand ${run.brandId} no longer exists.`);

  const done: RunStage[] = [];
  const progress = (message: string) => reportRunProgress(run.id, message);

  const enter = async (stage: RunStage, message: string) => {
    await updateRun(run.id, {
      stage,
      completedStages: [...done],
      message,
      heartbeatAt: new Date().toISOString(),
    });
  };

  const finish = async (stage: RunStage) => {
    done.push(stage);
    await updateRun(run.id, { completedStages: [...done], heartbeatAt: new Date().toISOString() });
  };

  /** Runs one stage while mirroring its state onto the legacy job record. */
  async function stage<T>(
    name: Exclude<RunStage, "discovery">,
    requestId: string,
    label: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const jobId = jobIdForStage(requestId, name);
    await enter(name, `${label}…`);
    await startJob(jobId, JOB_KIND[name]);
    try {
      const result = await work();
      await updateJob(jobId, {
        status: "complete",
        message: `${label} complete`,
        finishedAt: new Date().toISOString(),
      });
      await finish(name);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await updateJob(jobId, {
        status: "failed",
        message: `${label} failed`,
        error: message,
        finishedAt: new Date().toISOString(),
      });
      throw e;
    }
  }

  // --- Stage 0: discovery -------------------------------------------------
  await enter("discovery", "Finding competitors…");
  const competitors = await discoverCompetitors(brand, progress);
  await updateRun(run.id, { competitors });
  await finish("discovery");

  // The rest of the pipeline is keyed by requestId, so create the request the
  // existing stages and the /research/[id] page already understand.
  const request: ResearchRequest = await createRequest({
    companyName: brand.name,
    domain: brand.domain || undefined,
    industry: brand.industry || undefined,
    competitors,
  });
  await updateRun(run.id, { requestId: request.id });
  await setRequestStatus(request.id, "researching");

  // --- Stages 1-4.5 -------------------------------------------------------
  const competitorResult = await stage("research", request.id, "Analysing competitors", async () => {
    const result = await runCompetitorResearch(request, progress);
    await saveResult(result);
    await setRequestStatus(request.id, "complete");
    return result;
  });

  const trendResult = await stage("trends", request.id, "Analysing trends", async () => {
    const result = await runTrendAnalysis(request, competitorResult, progress);
    await saveTrendResult(result);
    return result;
  });

  const strategyResult = await stage("strategy", request.id, "Building strategy", async () => {
    const result = await runContentStrategy(request, competitorResult, trendResult, progress);
    await saveStrategyResult(result);
    return result;
  });

  const bucketResult = await stage("bucketing", request.id, "Building the calendar", async () => {
    const result = await runContentBucketing(request, strategyResult, progress);
    await saveBucketResult(result);
    return result;
  });

  await stage("creative", request.id, "Writing creative briefs", async () => {
    const result = await runCreativeDirector(request, bucketResult, progress);
    await saveCreativeResult(result);
    return result;
  });

  await updateRun(run.id, {
    status: "complete",
    stage: undefined,
    message: "Run complete",
    finishedAt: new Date().toISOString(),
    heartbeatAt: new Date().toISOString(),
  });
}

/**
 * Re-reads results from disk so a resumed/refreshed UI can show which stages
 * already have output, independent of the run record.
 */
export async function stageOutputs(requestId: string | undefined) {
  if (!requestId) return {};
  const [research, trends, strategy, bucketing] = await Promise.all([
    getResult(requestId),
    getTrendResult(requestId),
    getStrategyResult(requestId),
    getBucketResult(requestId),
  ]);
  return { research, trends, strategy, bucketing };
}
