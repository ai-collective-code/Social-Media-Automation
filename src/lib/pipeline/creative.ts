import { chatJSON } from "@/lib/llm";
import type { ResearchRequest } from "@/lib/research-store";
import type { BucketPost, BucketResult, CreativeBrief, CreativeResult } from "@/lib/pipeline-store";
import type { ProgressFn } from "@/lib/pipeline/research";
import { isVideoFormat } from "@/lib/reel-types";
import {
  brandContextForRequest,
  brandRulesBlock,
  type BrandContext,
} from "@/lib/brand-context";

/**
 * Workflow 4.5 — creative director, reading content bucketing output.
 *
 * CREATIVE_DIRECTOR_WORKFLOW_CONNECTED.md specifies a 5-phase manual process
 * per post (Intake, Insight, Ideation across 3 methods, recursive scoring
 * against a HumanKind scale and 569 legendary campaigns, Articulation) that
 * takes ~55 minutes per post by hand. That apparatus is collapsed here into
 * system-prompt reasoning instructions — the model is told to think through
 * insight -> ideation -> evaluation before answering — but the schema only
 * captures the final deliverable plus one score and one rationale line, not
 * every intermediate scoring table.
 *
 * Unlike workflows 1-4, this makes one model call PER POST rather than one
 * call for the whole batch: a single response covering 7 full briefs (each
 * with a scene-by-scene video prompt) risks truncation, and per-post calls
 * let progress be reported as each one lands. Calls run concurrently via
 * Promise.allSettled — NVIDIA NIM's ~40 req/min budget comfortably covers 7
 * concurrent calls — and a single post's failure doesn't fail the batch; it
 * is recorded in failedPostIds instead, same "honest partial data" pattern
 * research.ts uses for a partially-blocked search.
 */


function briefSchema(): string {
  return `{
  "conceptName": "string — short campaign-style name for this post's creative concept",
  "conceptOneSentence": "string — the concept in one sentence",
  "insight": "string — one sentence: the tension/truth this post responds to",
  "emotionalTone": "string — the specific emotion this should evoke (avoid generic words like 'happy')",
  "visualDirection": {
    "palette": ["2-4 colour names or hex codes"],
    "aesthetic": "string — one phrase describing the visual style",
    "vibe": "string — one phrase, e.g. 'professional clean, not spa-luxury'"
  },
  "imagePrompt": {
    "detailedPrompt": "string — a prompt for an AI IMAGE MODEL describing ONE single photographic frame. Describe subject, setting, light, lens and mood. HARD RULES: (a) no aspect ratio, no platform format, no 'carousel'/'SLIDE 1'/'thumbnail' — exactly one frame, and the app sets the dimensions; (b) no words, letters, numbers, signage, captions or logos anywhere in the image — image models render text as unreadable gibberish; (c) no hex codes — name colours in plain words instead",
    "textOverlay": "string — any wording that should sit ON the image, or null if none. This is kept OUT of detailedPrompt on purpose so it never gets rendered as gibberish. Keep it under 12 words",
    "styleReference": "string — comparable brand or aesthetic reference",
    "avoid": "string — what NOT to include, comma-separated"
  },
  "videoPrompt": "null if this post's platform/format is not a video (e.g. an image post, carousel, or written article), otherwise an object: { \\"totalDuration\\": string, \\"scenes\\": [ { \\"timing\\": string, \\"description\\": string } ] with 4-7 scenes, \\"overallDirection\\": string }",
  "copyDirection": {
    "hookExamples": ["3-4 example hook lines"],
    "tone": "string — 3-5 tone keywords",
    "hashtags": ["8-12 hashtags without the # symbol"],
    "captionExample": "string — a full example caption, 100-200 words"
  },
  "score": "number 0-10 — overall quality assessment",
  "scoreRationale": "string — one sentence justifying the score"
}`;
}

async function draftBrief(
  companyName: string,
  industry: string | undefined,
  post: BucketPost,
  brand?: BrandContext
): Promise<CreativeBrief> {
  // Shared with the Reels page so the two can't disagree about what counts as
  // video. The regex this replaced (/reel|video|tiktok/i) matched neither
  // "YouTube Shorts" nor "Long-Form Film", so those posts were briefed as
  // stills and got no scene direction at all.
  const isVideo = isVideoFormat(post.platform, post.contentType);

  const result = await chatJSON<Omit<CreativeBrief, "postId">>(
    [
      {
        role: "system",
        content: [
          "You are a creative director for social media content.",
          "",
          "Before answering, reason through: what tension/insight does this post respond to (a truth",
          "the audience feels but competitors don't address) -> what 2-3 creative directions could express",
          "it -> which one best fits the brief, is original, and is feasible to produce -> articulate that",
          "one direction fully. Do not include this reasoning in your answer — only the final brief.",
          "",
          `This post's format is ${isVideo ? "a VIDEO format — fill in videoPrompt" : "NOT a video format — set videoPrompt to null"}.`,
          "",
          "This may be any industry — never assume one. Ground every field in the specific topic and",
          "pillar given below, not generic social-media-brief boilerplate.",
          "",
          "ABOUT imagePrompt.detailedPrompt — it is executed literally by an AI image model, which",
          "has real limits. Write for that model, not for a human designer:",
          "  - ONE frame only. It cannot produce a carousel, a multi-slide set, or 'SLIDE 1 / SLIDE 2'.",
          "    If the concept is a carousel, describe only its single strongest frame.",
          "  - NO text in the image. It renders letters and numbers as unreadable gibberish. Never ask",
          "    for headlines, signage, handwriting, stamps, logos or typography. Put any intended",
          "    wording in textOverlay instead, where it stays legible.",
          "  - NO aspect ratios or platform formats ('9:16', 'YouTube thumbnail'). The app sets size.",
          "  - NO hex codes — it cannot match them. Name colours in words ('oxide red', 'cream').",
          "Art direction that doesn't fit those limits still belongs in visualDirection, which is for",
          "humans and design tools — just keep it out of detailedPrompt.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          `Brand: ${companyName}\n` +
          (industry ? `Category: ${industry}\n` : "") +
          `Post: ${post.day} ${post.time} — ${post.platform}\n` +
          `Pillar: ${post.pillar} | Buyer stage: ${post.buyerStage}\n` +
          `Topic: ${post.topic}\n` +
          `Content type: ${post.contentType}\n` +
          `Why this post: ${post.whyThisPost}\n` +
          `Hashtag themes: ${post.hashtagThemes.join(", ")}\n\n` +
          brandRulesBlock(brand) +
          `\nProduce a complete creative brief for this single post. Return JSON in exactly this shape:\n\n${briefSchema()}`,
      },
    ],
    { creative: true, maxTokens: 4000, temperature: 0.6, jsonRetries: 2 }
  );

  return { postId: post.id, ...result };
}

export async function runCreativeDirector(
  request: ResearchRequest,
  bucketResult: BucketResult,
  onProgress: ProgressFn = () => {}
): Promise<CreativeResult> {
  const { companyName, industry } = request;
  const total = bucketResult.posts.length;
  let done = 0;

  // Resolved once for the batch: the brand's voice, audience and never-say
  // rules apply to every brief, and re-reading them per post would be seven
  // identical lookups.
  const brand = await brandContextForRequest(request.id);

  await onProgress(`Drafting creative briefs for ${total} posts…`);

  const settled = await Promise.allSettled(
    bucketResult.posts.map(async (post) => {
      const brief = await draftBrief(companyName, industry, post, brand);
      done += 1;
      await onProgress(`Drafted ${done}/${total} creative briefs…`);
      return brief;
    })
  );

  const briefs: CreativeBrief[] = [];
  const failedPostIds: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") briefs.push(r.value);
    else failedPostIds.push(bucketResult.posts[i].id);
  });

  if (briefs.length === 0) {
    throw new Error(
      `Creative brief generation failed for all ${total} posts. Last error: ` +
        (settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined)?.reason
    );
  }

  return {
    requestId: request.id,
    briefs,
    failedPostIds,
    createdAt: new Date().toISOString(),
  };
}
