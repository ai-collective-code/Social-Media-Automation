/**
 * Constants and types shared between the art director and the UI that drives it.
 *
 * Deliberately import-free. The Refine panel is a Client Component and needs
 * REFINE_PRESETS as a *runtime value*; importing that from `art-director.ts`
 * would drag the LLM stack — and everything it imports — into the browser
 * bundle. That failure typechecks cleanly and only shows up as a 500 at
 * runtime, so the split is load-bearing, not stylistic.
 */

export type Refinement = {
  /** The rewritten scene description, ready to compose into a full prompt. */
  prompt: string;
  /** One line on what changed, shown on the card. */
  note: string;
};

/** Used when the user refines without typing anything — the one-click lift. */
export const ELEVATE_INSTRUCTION =
  "Elevate this to international editorial standard: stronger composition, more " +
  "intentional light, richer atmosphere and a more sophisticated, premium feel.";

/** One-tap starting points, so refining doesn't require writing a brief. */
export const REFINE_PRESETS: { label: string; instruction: string }[] = [
  { label: "✨ Make it premium", instruction: ELEVATE_INSTRUCTION },
  {
    label: "🎬 More cinematic",
    instruction:
      "Make it cinematic: directional low-key light, deeper shadows, wider anamorphic-style framing and a filmic colour grade.",
  },
  {
    label: "☀️ Warmer light",
    instruction:
      "Relight it with warm golden-hour sun, soft long shadows and a gentle amber cast.",
  },
  {
    label: "🧊 Cleaner / minimal",
    instruction:
      "Simplify the composition: fewer elements, calmer negative space, one clear subject, restrained neutral palette.",
  },
  {
    label: "🔍 Closer crop",
    instruction:
      "Move much closer to the subject — tight detail crop, shallow depth of field, background falling away.",
  },
  {
    label: "🔄 Different angle",
    instruction:
      "Keep the same subject and mood but shoot it from a distinctly different camera angle and vantage point.",
  },
];
