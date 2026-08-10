/**
 * Run types and constants — no Node built-ins, so this is safe to import from
 * Client Components. `run-store.ts` does the filesystem work and re-exports.
 */

import type { Competitor } from "@/lib/research-store";

export type RunStage =
  | "discovery"
  | "research"
  | "trends"
  | "strategy"
  | "bucketing"
  | "creative";

export const RUN_STAGES: RunStage[] = [
  "discovery",
  "research",
  "trends",
  "strategy",
  "bucketing",
  "creative",
];

export const STAGE_LABEL: Record<RunStage, string> = {
  discovery: "Find competitors",
  research: "Competitor analysis",
  trends: "Trend analysis",
  strategy: "Content strategy",
  bucketing: "Content calendar",
  creative: "Creative briefs",
};

export type RunStatus = "queued" | "running" | "complete" | "failed";

export type Run = {
  id: string;
  brandId: string;
  /** Denormalised so a run still renders if the brand is later renamed. */
  brandName: string;
  requestId?: string;
  status: RunStatus;
  stage?: RunStage;
  completedStages: RunStage[];
  /** What the discovery stage found, kept for auditability. */
  competitors?: Competitor[];
  message: string;
  error?: string;
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  /** Refreshed on every progress update; used to detect a dead worker. */
  heartbeatAt?: string;
};
