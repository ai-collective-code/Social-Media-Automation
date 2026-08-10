import { chatJSON } from "@/lib/llm";
import {
  researchQuery,
  bundlesToContext,
  collectSources,
  isSearchBlocked,
  type ResearchBundle,
} from "@/lib/websearch";
import type { ResearchRequest, ResearchResult } from "@/lib/research-store";
import type { Trend, TrendResult } from "@/lib/pipeline-store";
import type { ProgressFn } from "@/lib/pipeline/research";

/**
 * Workflow 2 — trend analysis, reading competitor analysis output.
 *
 * Same shape as workflow 1: search is cheap and parallelisable, the model
 * call is not, so this gathers everything up front and spends exactly one
 * model call synthesising it. Queries are built from what the competitor
 * research actually found (gaps + platforms) rather than generic industry
 * trends, per TREND_ANALYSIS_WORKFLOW_UPDATED.md's core principle: analyse
 * trends related to what competitors are doing, not random trends.
 */

function queriesFor(industry: string | undefined, competitorResult: ResearchResult): string[] {
  const cat = industry ? `${industry} ` : "";
  const platforms = new Set<string>();
  const gapWords: string[] = [];

  for (const c of competitorResult.competitors) {
    for (const p of c.platforms) platforms.add(p.platform);
  }
  for (const gap of competitorResult.keyGaps.slice(0, 3)) gapWords.push(gap);

  const queries = [`${cat}social media content trends 2026`];
  if (platforms.size > 0) {
    queries.push(`${cat}${[...platforms].slice(0, 2).join(" ")} trending content formats 2026`);
  }
  for (const gap of gapWords) {
    queries.push(`${cat}trend "${gap.slice(0, 60)}"`.trim());
  }
  return queries.slice(0, 4);
}

export async function runTrendAnalysis(
  request: ResearchRequest,
  competitorResult: ResearchResult,
  onProgress: ProgressFn = () => {}
): Promise<TrendResult> {
  const { companyName, industry } = request;

  await onProgress("Searching for trends related to what competitors are doing…");

  const queries = queriesFor(industry, competitorResult);
  const bundles: ResearchBundle[] = await Promise.all(
    queries.map((q) => researchQuery(q, { results: 5, readTop: 2, maxCharsPerPage: 5000 }))
  );

  const pagesRead = bundles.reduce((n, b) => n + b.pages.length, 0);
  const blocked = isSearchBlocked();

  if (blocked && pagesRead === 0) {
    throw new Error(
      "The search engine is temporarily blocking automated queries after recent request volume. " +
        "It should clear in a few minutes — try again shortly rather than immediately."
    );
  }
  if (!blocked && pagesRead === 0) {
    throw new Error(
      "Web search returned no readable pages. The search provider may be rate-limiting; try again shortly."
    );
  }

  await onProgress(
    `Read ${pagesRead} pages across ${bundles.length} searches. Analysing with the model — this can take several minutes.`
  );

  const context = bundlesToContext(bundles);

  const gapSummary = competitorResult.keyGaps.length
    ? competitorResult.keyGaps.map((g) => `- ${g}`).join("\n")
    : "(no gaps identified in competitor research)";

  const competitorSummary = competitorResult.competitors
    .map((c) => {
      const platformLine = c.platforms
        .map((p) => `${p.platform}${p.topContentThemes?.length ? ` (${p.topContentThemes.join(", ")})` : ""}`)
        .join("; ");
      return `- ${c.name}: ${c.summary ?? "no summary"}${platformLine ? ` — platforms: ${platformLine}` : ""}`;
    })
    .join("\n");

  const schema = `{
  "trends": [
    {
      "name": "string — short trend name",
      "growthSignal": "string — the evidence for growth, cite what a source said; if no number was found, describe the qualitative signal instead of inventing a percentage",
      "competitorGap": "string — what the analysed competitors are NOT doing about this trend",
      "opportunity": "string — one concrete, actionable content idea that exploits the gap"
    }
  ],
  "recommendedActions": ["4-6 concrete actions for this week, each naming what to make and why"]
}`;

  const result = await chatJSON<{ trends: Trend[]; recommendedActions: string[] }>(
    [
      {
        role: "system",
        content: [
          "You are a social media trend analyst.",
          "",
          "GROUNDING RULES:",
          "1. The SOURCES below are current; your training data may be stale. Where they disagree, trust the sources.",
          "2. Never state a growth percentage or metric unless a source states it. Describe the signal qualitatively otherwise — an invented number is worse than none.",
          "3. Only report trends that connect to something in the competitor data below (a gap, a platform, a content theme) — this is trend analysis IN CONTEXT of these specific competitors, not a generic trends listicle.",
          "4. If the sources are thin for a given angle, say so rather than padding with generic claims.",
          "",
          "This may be any industry — never assume one.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          `Our brand: ${companyName}\n` +
          (industry ? `Category: ${industry}\n\n` : "\n") +
          `Competitor analysis findings:\n${competitorSummary}\n\n` +
          `Key gaps already identified:\n${gapSummary}\n\n` +
          `Find trends related to the above — what's growing that these competitors are missing — ` +
          `and return JSON in exactly this shape:\n\n${schema}\n\n` +
          (blocked
            ? "NOTE: the search provider began blocking requests partway through this run, so results below may be thinner than usual — say so rather than treating gaps as a lack of any trend.\n\n"
            : "") +
          `Research gathered from the web follows.\n\n${context}`,
      },
    ],
    { maxTokens: 8000, temperature: 0.4, jsonRetries: 2 }
  );

  return {
    requestId: request.id,
    trends: result.trends ?? [],
    recommendedActions: result.recommendedActions ?? [],
    analyzedAt: new Date().toISOString(),
    sources: collectSources(bundles),
  };
}
