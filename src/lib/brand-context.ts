import { listRuns } from "@/lib/run-store";
import { getBrand } from "@/lib/brand-store";
import type { Brand } from "@/lib/brand-types";

/**
 * The brand's own rules, resolved for a pipeline run.
 *
 * The brand form has always collected voice, audience, markets and a
 * never-say list, but only the company name and industry ever reached a
 * prompt — everything else was written to disk and then ignored. A brand
 * safety field that silently does nothing is worse than not having one, since
 * it reads as a guardrail that is in force. This is the missing link between
 * what the user typed and what the models are told.
 *
 * Runs carry `brandId` and `requestId`, so a request can be traced back to the
 * brand that started it. A request with no run (created directly on the
 * research page) resolves to undefined and every consumer falls back to its
 * previous behaviour.
 */

export type BrandContext = {
  name: string;
  industry?: string;
  description?: string;
  audience?: string;
  voice?: string;
  neverSay?: string;
  markets?: string;
  avoidVisuals?: string;
  imageSeed?: number;
  language?: string;
};

export function toBrandContext(brand: Brand): BrandContext {
  return {
    name: brand.name,
    industry: brand.industry,
    description: brand.description,
    audience: brand.audience,
    voice: brand.voice,
    neverSay: brand.neverSay,
    markets: brand.markets,
    avoidVisuals: brand.avoidVisuals,
    imageSeed: brand.imageSeed,
    language: brand.language,
  };
}

export async function brandContextForRequest(
  requestId: string,
): Promise<BrandContext | undefined> {
  const runs = await listRuns();
  const run = runs.find((r) => r.requestId === requestId);
  if (!run) return undefined;

  const brand = await getBrand(run.brandId);
  return brand ? toBrandContext(brand) : undefined;
}

/**
 * The brand's rules as prompt lines.
 *
 * Returns an empty string when nothing is configured, so callers can
 * concatenate unconditionally without emitting a dangling header.
 */
export function brandRulesBlock(context?: BrandContext): string {
  if (!context) return "";

  const lines: string[] = [];
  if (context.description) lines.push(`What the brand is: ${context.description}`);
  if (context.audience) lines.push(`Who it is for: ${context.audience}`);
  if (context.voice) lines.push(`How it must sound: ${context.voice}`);
  if (context.markets) lines.push(`Where the audience is: ${context.markets}`);
  if (context.language && context.language.toLowerCase() !== "english") {
    lines.push(
      `Write all captions, hooks and on-screen text in ${context.language}. ` +
        `Keep hashtags in the script the audience actually searches in.`,
    );
  }
  // Last, and phrased as absolute — a constraint buried mid-list gets treated
  // as a preference by most models.
  if (context.neverSay) {
    lines.push(
      `NEVER say or imply any of the following, in any wording: ${context.neverSay}. ` +
        `This is a hard brand-safety rule, not a stylistic preference.`,
    );
  }

  return lines.length > 0 ? `\nBRAND RULES\n${lines.map((l) => `- ${l}`).join("\n")}\n` : "";
}
