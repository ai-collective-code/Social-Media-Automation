import { chatJSON } from "@/lib/llm";
import type { ResearchRequest, ResearchResult } from "@/lib/research-store";
import type { BuyerStageMapping, ContentPillar, StrategyResult, TrendResult } from "@/lib/pipeline-store";
import type { ProgressFn } from "@/lib/pipeline/research";

/**
 * Workflow 3 — content strategy, reading competitor + trend analysis output.
 *
 * Pure synthesis: no web research needed here, the model reasons over the
 * two prior JSON results already gathered. So this is a single model call
 * with no search phase, unlike workflows 1 and 2.
 */

export async function runContentStrategy(
  request: ResearchRequest,
  competitorResult: ResearchResult,
  trendResult: TrendResult,
  onProgress: ProgressFn = () => {}
): Promise<StrategyResult> {
  const { companyName, industry } = request;

  await onProgress("Synthesising content strategy from competitor + trend findings…");

  const gapSummary = competitorResult.keyGaps.length
    ? competitorResult.keyGaps.map((g) => `- ${g}`).join("\n")
    : "(none identified)";

  const trendSummary = trendResult.trends.length
    ? trendResult.trends
        .map((t) => `- ${t.name}: ${t.growthSignal} — competitor gap: ${t.competitorGap} — opportunity: ${t.opportunity}`)
        .join("\n")
    : "(no trends identified)";

  const schema = `{
  "pillars": [
    {
      "name": "string — pillar name, e.g. Education, Transformation, Transparency",
      "percentage": "number — share of weekly content this pillar should get, all pillars must sum to 100",
      "rationale": "string — ties back to a specific competitor gap or trend from the data below, not a generic justification"
    }
  ],
  "buyerJourney": [
    {
      "stage": "Awareness | Consideration | Decision | Implementation",
      "pillar": "string — which pillar above serves this stage",
      "postsPerWeek": "number"
    }
  ],
  "platformStrategy": "string — 2-4 sentences on which platforms get which pillars and why, grounded in the competitor platform data",
  "successMetrics": ["3-5 measurable targets, each stating a number and what it's compared against"]
}`;

  const result = await chatJSON<{
    pillars: ContentPillar[];
    buyerJourney: BuyerStageMapping[];
    platformStrategy: string;
    successMetrics: string[];
  }>(
    [
      {
        role: "system",
        content: [
          "You are a social media content strategist.",
          "",
          "RULES:",
          "1. Every pillar's rationale and every buyer-journey mapping must be traceable to something in the",
          "   competitor or trend data below — not generic marketing boilerplate.",
          "2. Pillar percentages must sum to 100.",
          "3. Between 3 and 5 pillars total — fewer than 3 is too coarse to plan a week around, more than 5",
          "   dilutes each pillar below a meaningful posting cadence.",
          "4. This may be any industry — never assume one.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          `Our brand: ${companyName}\n` +
          (industry ? `Category: ${industry}\n\n` : "\n") +
          `Competitor gaps identified:\n${gapSummary}\n\n` +
          `Trends identified:\n${trendSummary}\n\n` +
          `Define a content strategy (pillars, buyer journey mapping, platform strategy, success metrics) ` +
          `that exploits the above. Return JSON in exactly this shape:\n\n${schema}`,
      },
    ],
    { maxTokens: 6000, temperature: 0.4, jsonRetries: 2 }
  );

  return {
    requestId: request.id,
    pillars: result.pillars ?? [],
    buyerJourney: result.buyerJourney ?? [],
    platformStrategy: result.platformStrategy ?? "",
    successMetrics: result.successMetrics ?? [],
    createdAt: new Date().toISOString(),
  };
}
