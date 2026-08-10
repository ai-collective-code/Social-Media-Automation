import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "@/lib/app-paths";

/**
 * Result storage for workflows 2-4.5 (Trend Analysis, Content Strategy,
 * Content Bucketing, Creative Director).
 *
 * Same disk-backed shape as research-store.ts's getResult/saveResult, just
 * one file per stage per request so a request can carry multiple stage
 * results without them colliding. Lives in the same data/results/ dir the
 * competitor-research result already uses (that one is `${id}.json`; these
 * are `${id}.<stage>.json`, so there's no collision).
 */


const RESULTS_DIR = path.join(dataDir(), "results");

export type Trend = {
  name: string;
  growthSignal: string;
  competitorGap: string;
  opportunity: string;
};

export type TrendResult = {
  requestId: string;
  trends: Trend[];
  recommendedActions: string[];
  analyzedAt: string;
  sources: string[];
};

export type ContentPillar = {
  name: string;
  percentage: number;
  rationale: string;
};

export type BuyerStageMapping = {
  stage: string;
  pillar: string;
  postsPerWeek: number;
};

export type StrategyResult = {
  requestId: string;
  pillars: ContentPillar[];
  buyerJourney: BuyerStageMapping[];
  platformStrategy: string;
  successMetrics: string[];
  createdAt: string;
};

export type BucketPost = {
  id: string;
  day: string;
  time: string;
  platform: string;
  pillar: string;
  buyerStage: string;
  topic: string;
  contentType: string;
  whyThisPost: string;
  hashtagThemes: string[];
};

export type BucketResult = {
  requestId: string;
  posts: BucketPost[];
  createdAt: string;
};

export type CreativeBrief = {
  postId: string;
  conceptName: string;
  conceptOneSentence: string;
  insight: string;
  emotionalTone: string;
  visualDirection: {
    palette: string[];
    aesthetic: string;
    vibe: string;
  };
  imagePrompt: {
    detailedPrompt: string;
    styleReference: string;
    avoid: string;
    /**
     * Words meant to appear ON the image, deliberately kept OUT of
     * `detailedPrompt`. Image models render text as unreadable squiggles, so
     * asking for it inside the prompt produces gibberish. Holding it here
     * keeps the creative intent without corrupting the generated image — and
     * makes it available to a typography overlay later.
     *
     * Optional: briefs generated before this field existed won't have it.
     */
    textOverlay?: string | null;
  };
  videoPrompt: {
    totalDuration: string;
    scenes: { timing: string; description: string }[];
    overallDirection: string;
  } | null;
  copyDirection: {
    hookExamples: string[];
    tone: string;
    hashtags: string[];
    captionExample: string;
  };
  score: number;
  scoreRationale: string;
};

export type CreativeResult = {
  requestId: string;
  briefs: CreativeBrief[];
  /** Post ids whose brief generation failed — surfaced honestly, not silently dropped. */
  failedPostIds: string[];
  createdAt: string;
};

async function ensureDataDir() {
  await fs.mkdir(RESULTS_DIR, { recursive: true });
}

async function readStage<T>(requestId: string, stage: string): Promise<T | undefined> {
  await ensureDataDir();
  try {
    const raw = await fs.readFile(path.join(RESULTS_DIR, `${requestId}.${stage}.json`), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function writeStage(requestId: string, stage: string, data: unknown): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(
    path.join(RESULTS_DIR, `${requestId}.${stage}.json`),
    JSON.stringify(data, null, 2),
    "utf-8"
  );
}

export const getTrendResult = (requestId: string) => readStage<TrendResult>(requestId, "trends");
export const saveTrendResult = (result: TrendResult) =>
  writeStage(result.requestId, "trends", result);

export const getStrategyResult = (requestId: string) =>
  readStage<StrategyResult>(requestId, "strategy");
export const saveStrategyResult = (result: StrategyResult) =>
  writeStage(result.requestId, "strategy", result);

export const getBucketResult = (requestId: string) =>
  readStage<BucketResult>(requestId, "bucketing");
export const saveBucketResult = (result: BucketResult) =>
  writeStage(result.requestId, "bucketing", result);

export const getCreativeResult = (requestId: string) =>
  readStage<CreativeResult>(requestId, "creative");
export const saveCreativeResult = (result: CreativeResult) =>
  writeStage(result.requestId, "creative", result);
