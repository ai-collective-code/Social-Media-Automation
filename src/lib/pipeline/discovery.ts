import { chatJSON } from "@/lib/llm";
import {
  researchQuery,
  bundlesToContext,
  isSearchBlocked,
  type ResearchBundle,
} from "@/lib/websearch";
import type { Competitor } from "@/lib/research-store";
import type { ProgressFn } from "@/lib/pipeline/research";

/**
 * Only the fields this stage actually reads. A full `Brand` satisfies this
 * structurally, so the orchestrator's call site needs no change — but the
 * standalone /research intake form can call this too, without first having to
 * construct a persisted Brand record just to discover competitors.
 */
export type DiscoveryInput = {
  name: string;
  domain?: string;
  industry?: string;
  description?: string;
  markets?: string;
};

/**
 * Stage 0 — find the brand's competitors.
 *
 * The original pipeline required competitors to be typed in by hand;
 * `runCompetitorResearch` analyses the names it is given and never discovers
 * any. This step fills that gap so a run can start from a brand profile alone.
 *
 * Same economics as the other stages: searches are concurrent and cheap, then
 * exactly one model call turns the pages into a list.
 */

const MAX_COMPETITORS = 5;

function queriesFor(brand: DiscoveryInput): string[] {
  const sector = brand.industry ? ` ${brand.industry}` : "";
  const queries = [
    `"${brand.name}" competitors`,
    `brands similar to "${brand.name}"${sector} alternatives`,
  ];
  // Without an industry the third query would just repeat the first two.
  if (brand.industry) {
    queries.push(`leading ${brand.industry} brands ${brand.markets ?? ""}`.trim());
  }
  return queries;
}

export async function discoverCompetitors(
  brand: DiscoveryInput,
  onProgress: ProgressFn = () => {},
): Promise<Competitor[]> {
  const queries = queriesFor(brand);
  await onProgress(`Searching for competitors of ${brand.name}…`);

  const bundles: ResearchBundle[] = await Promise.all(
    queries.map((q) => researchQuery(q, { results: 6, readTop: 2, maxCharsPerPage: 5000 })),
  );

  const pagesRead = bundles.reduce((n, b) => n + b.pages.length, 0);

  if (pagesRead === 0) {
    // Distinguish the two causes: one is temporary and worth retrying, the
    // other means this brand genuinely has no findable coverage.
    throw new Error(
      isSearchBlocked()
        ? "The search engine is temporarily blocking automated queries after this session's volume. " +
          "It usually clears within a few minutes — start the run again shortly."
        : `No readable pages were found for "${brand.name}". Check the brand name and industry are ` +
          `spelled as they appear publicly, then try again.`,
    );
  }

  await onProgress(
    `Read ${pagesRead} pages. Identifying competitors — this can take a few minutes.`,
  );

  const schema = `{
  "competitors": [
    {
      "name": "string — the competitor's brand name as commonly written",
      "url": "string — their primary website if a source states it, otherwise omit",
      "why": "one sentence: why this is a competitor of the brand"
    }
  ]
}`;

  const parsed = await chatJSON<{
    competitors: { name?: string; url?: string; why?: string }[];
  }>(
    [
      {
        role: "system",
        content: [
          "You identify a brand's real commercial competitors from web sources.",
          "",
          "RULES:",
          "1. Only name competitors that appear in the SOURCES below. Do not add",
          "   companies from memory, however obvious they seem.",
          `2. Never list "${brand.name}" itself, nor its parent or subsidiaries.`,
          "3. Exclude retailers, marketplaces, directories, review sites and press",
          "   outlets — they carry the brand, they do not compete with it.",
          `4. Return at most ${MAX_COMPETITORS}, ordered most to least directly competing.`,
          "5. If the sources genuinely name none, return an empty array. An empty",
          "   answer is correct and useful; an invented one is not.",
          "",
          `Respond as JSON matching:\n${schema}`,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `BRAND: ${brand.name}`,
          brand.domain ? `WEBSITE: ${brand.domain}` : "",
          brand.industry ? `INDUSTRY: ${brand.industry}` : "",
          brand.description ? `WHAT THEY DO: ${brand.description}` : "",
          brand.markets ? `MARKETS: ${brand.markets}` : "",
          "",
          "SOURCES:",
          bundlesToContext(bundles),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    { maxTokens: 4000 },
  );

  const seen = new Set<string>([brand.name.trim().toLowerCase()]);
  const competitors: Competitor[] = [];

  for (const raw of parsed.competitors ?? []) {
    const name = String(raw?.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const url = String(raw?.url ?? "").trim();
    competitors.push({ name, url: url || undefined });
    if (competitors.length >= MAX_COMPETITORS) break;
  }

  if (competitors.length === 0) {
    throw new Error(
      `Could not identify any competitors for "${brand.name}" from the sources found. ` +
        `Adding an industry and a short description to the brand profile usually fixes this, ` +
        `since both are used to target the search.`,
    );
  }

  await onProgress(`Found ${competitors.length} competitors: ${competitors.map((c) => c.name).join(", ")}`);
  return competitors;
}
