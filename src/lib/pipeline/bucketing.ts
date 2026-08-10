import { chatJSON } from "@/lib/llm";
import type { ResearchRequest } from "@/lib/research-store";
import type { BucketPost, BucketResult, StrategyResult } from "@/lib/pipeline-store";
import type { ProgressFn } from "@/lib/pipeline/research";

/**
 * Workflow 4 — content bucketing, reading content strategy output.
 *
 * Pure synthesis: distributes the strategy's pillars and buyer-journey
 * mapping across a 7-day week (day, time, platform, topic), matching the
 * pillar percentages from Content Strategy as closely as 7 whole posts
 * allow. One model call, no web research.
 */

export async function runContentBucketing(
  request: ResearchRequest,
  strategyResult: StrategyResult,
  onProgress: ProgressFn = () => {}
): Promise<BucketResult> {
  const { companyName, industry } = request;

  await onProgress("Distributing the strategy across a 7-day content calendar…");

  const pillarSummary = strategyResult.pillars
    .map((p) => `- ${p.name} (${p.percentage}%): ${p.rationale}`)
    .join("\n");

  const journeySummary = strategyResult.buyerJourney
    .map((j) => `- ${j.stage} → ${j.pillar} (${j.postsPerWeek}/week)`)
    .join("\n");

  const schema = `{
  "posts": [
    {
      "id": "string — e.g. MON_001, TUE_001, one per day Monday through Sunday, exactly 7 posts",
      "day": "string — Monday..Sunday",
      "time": "string — e.g. '09:00 AM'",
      "platform": "string — e.g. Instagram Reel, Instagram Carousel, TikTok, LinkedIn Article",
      "pillar": "string — must match one of the pillar names given",
      "buyerStage": "string — must match one of the buyer journey stages given",
      "topic": "string — a specific, concrete post topic, not a generic placeholder",
      "contentType": "string — e.g. Educational Reel, Before/After Carousel, Thought Leadership Article",
      "whyThisPost": "string — one sentence tying this post back to the pillar's rationale",
      "hashtagThemes": ["3-5 hashtag themes without the # symbol"]
    }
  ]
}`;

  const result = await chatJSON<{ posts: BucketPost[] }>(
    [
      {
        role: "system",
        content: [
          "You are a social media content calendar planner.",
          "",
          "RULES:",
          "1. Produce EXACTLY 7 posts, one per day Monday through Sunday, no more, no fewer.",
          "2. Match the pillar percentages as closely as 7 whole posts allow (round to the nearest whole post).",
          "3. Every buyer-journey stage given must be represented by at least one post.",
          "4. Vary platform and posting time across the week rather than repeating the same slot.",
          "5. Topics must be specific and concrete, not placeholders like 'post about pillar X'.",
          "6. This may be any industry — never assume one.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          `Our brand: ${companyName}\n` +
          (industry ? `Category: ${industry}\n\n` : "\n") +
          `Content pillars:\n${pillarSummary}\n\n` +
          `Buyer journey mapping:\n${journeySummary}\n\n` +
          `Platform strategy: ${strategyResult.platformStrategy}\n\n` +
          `Build the 7-post weekly content calendar. Return JSON in exactly this shape:\n\n${schema}`,
      },
    ],
    { maxTokens: 6000, temperature: 0.4, jsonRetries: 2 }
  );

  return {
    requestId: request.id,
    posts: result.posts ?? [],
    createdAt: new Date().toISOString(),
  };
}
