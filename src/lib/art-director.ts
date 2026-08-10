import { chatJSON } from "@/lib/llm";
import { ELEVATE_INSTRUCTION, type Refinement } from "@/lib/art-director-types";

/**
 * The AI art director behind each post's "Refine" control.
 *
 * It rewrites one image prompt in response to a note from the user — the same
 * loop you'd have with a photographer, except the brief being amended is the
 * one an image model executes. So it inherits the image model's hard limits
 * (one frame, no legible text, no hex codes) and is told to change only what
 * was asked, because the common failure here is a model that "improves" the
 * whole shot and loses the thing the user already liked.
 */

export async function refineImagePrompt(input: {
  brandName: string;
  topic: string;
  /** The prompt currently in force — brief-derived, or a previous refinement. */
  currentPrompt: string;
  /** The user's note. Blank means "just make it better". */
  instruction: string;
}): Promise<Refinement> {
  const instruction = input.instruction.trim() || ELEVATE_INSTRUCTION;

  const result = await chatJSON<Refinement>(
    [
      {
        role: "system",
        content: [
          "You are an award-winning art director and photographer directing an AI image model.",
          "You are given the prompt currently used for one social post, plus a change request.",
          "Rewrite the prompt so it satisfies the request.",
          "",
          "Rules that are not negotiable, because the image model cannot do otherwise:",
          "  - Describe ONE single photographic frame. Never a carousel, a set, or numbered slides.",
          "  - No text of any kind in the image — no headlines, signage, handwriting, stamps,",
          "    labels, numbers or logos. The model renders letters as unreadable gibberish.",
          "  - No aspect ratios or platform formats. The app sets the output size.",
          "  - No hex codes. Name colours in plain words.",
          "",
          "Craft, because the output must hold up as international-standard brand photography:",
          "  - Be specific about subject, setting, camera distance, lens character, light direction",
          "    and quality, surface texture, and mood. Vague prompts produce generic stock images.",
          "  - Prefer one strong subject and real, motivated light over busy scenes and even lighting.",
          "  - Describe, don't stack keywords. Flowing sentences beat comma-separated adjective piles.",
          "",
          "Change ONLY what the request asks for. Everything the user did not mention — subject,",
          "brand, setting, story — must survive intact. This is an amendment, not a fresh concept.",
          "",
          'Reply as JSON: { "prompt": "the full rewritten scene description", "note": "one short',
          'sentence, under 15 words, saying what you changed" }',
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Brand: ${input.brandName}`,
          `Post topic: ${input.topic}`,
          "",
          "CURRENT PROMPT:",
          input.currentPrompt,
          "",
          "CHANGE REQUEST:",
          instruction,
        ].join("\n"),
      },
    ],
    { creative: true, maxTokens: 1200, temperature: 0.7, jsonRetries: 2 },
  );

  const prompt = (result?.prompt ?? "").trim();
  if (!prompt) {
    throw new Error("The art director returned an empty prompt — nothing was changed.");
  }

  return { prompt, note: (result?.note ?? "").trim() || "Refined." };
}
