import { chatJSON } from "@/lib/llm";
import {
  researchQuery,
  bundlesToContext,
  collectSources,
  isSearchBlocked,
  type ResearchBundle,
} from "@/lib/websearch";
import type { ResearchRequest, ResearchResult } from "@/lib/research-store";

/**
 * Workflow 1 — competitor analysis, run autonomously.
 *
 * Shape of the work: search is cheap and parallelisable, LLM calls are not
 * (GLM-5.2 measured 190-341s each). So this gathers everything up front with
 * concurrent searches, then spends exactly ONE model call synthesising it.
 * Per-competitor model calls would multiply runtime by the competitor count
 * for no gain in quality.
 */

/**
 * Queries per competitor.
 *
 * Earlier, broader queries ("<brand> <category> market share 2026") pulled
 * generic market-research SEO pages — "top beverage trends 2026" — instead of
 * anything about the brand. These are anchored to the brand name plus a
 * concrete angle so the results are about the company, not the sector.
 */
function queriesFor(name: string, category?: string): string[] {
  const cat = category ? ` ${category}` : "";
  return [
    `"${name}" brand news latest campaign${cat}`,
    `"${name}" Instagram social media content strategy`,
    `"${name}"${cat} revenue market share growth`,
  ];
}

export type ProgressFn = (message: string) => void | Promise<void>;

export async function runCompetitorResearch(
  request: ResearchRequest,
  onProgress: ProgressFn = () => {}
): Promise<ResearchResult> {
  const { companyName, industry, competitors } = request;

  // --- Phase 1: gather (concurrent, no model involved) --------------------
  const targets = [
    { name: companyName, isOwn: true },
    ...competitors.map((c) => ({ name: c.name, isOwn: false })),
  ];

  await onProgress(`Searching the web for ${targets.length} brands…`);

  const bundlesByTarget = await Promise.all(
    targets.map(async (t) => {
      const bundles: ResearchBundle[] = await Promise.all(
        queriesFor(t.name, industry).map((q) =>
          researchQuery(q, { results: 5, readTop: 2, maxCharsPerPage: 5000 })
        )
      );
      return { target: t, bundles };
    })
  );

  const allBundles = bundlesByTarget.flatMap((b) => b.bundles);
  const pagesRead = allBundles.reduce((n, b) => n + b.pages.length, 0);
  const blocked = isSearchBlocked();

  // The search provider can trip its own bot detection under exactly the
  // burst this step produces, and answers with a normal-looking page that
  // contains no results. searchWeb() detects that and opens a breaker, but
  // by the time this step notices, several queries have already come back
  // empty — so this surfaces as a clear, named cause instead of the pipeline
  // (or the model) treating a blocked search as "this brand has no presence."
  if (blocked) {
    if (pagesRead === 0) {
      throw new Error(
        "The search engine is temporarily blocking automated queries after this session's request " +
          "volume (its own bot detection, not a bug in this brand's data). It should clear in a few " +
          "minutes — try again shortly rather than immediately."
      );
    }
    await onProgress(
      `Read ${pagesRead} pages, but the search engine started blocking requests partway through — ` +
        `some competitors below may show little or no data because of that, not because they lack a presence. ` +
        `Analysing what was gathered.`
    );
  } else if (pagesRead === 0) {
    throw new Error(
      "Web search returned no readable pages. The search provider may be rate-limiting; try again shortly."
    );
  } else {
    await onProgress(
      `Read ${pagesRead} pages across ${allBundles.length} searches. Analysing with the model — this can take several minutes.`
    );
  }

  // --- Phase 2: synthesise (one model call) ------------------------------
  const context = bundlesByTarget
    .map(
      ({ target, bundles }) =>
        `## ${target.isOwn ? "OUR BRAND" : "COMPETITOR"}: ${target.name}\n\n${bundlesToContext(bundles)}`
    )
    .join("\n\n");

  const schema = `{
  "competitors": [
    {
      "name": "string — competitor name exactly as given",
      "summary": "2-4 sentences on their positioning and what they are winning on",
      "platforms": [
        {
          "platform": "Instagram | YouTube | TikTok | LinkedIn | X",
          "followers": "number, ONLY if a source states it — otherwise omit the field",
          "engagementRate": "number, ONLY if a source states it — otherwise omit",
          "postingFrequency": "string or omit",
          "topContentThemes": ["3-4 themes"],
          "gaps": ["what they are NOT doing"],
          "notes": "string or omit"
        }
      ]
    }
  ],
  "keyGaps": ["4-6 specific openings our brand can exploit, each one sentence with the reason"],
  "recommendations": ["4-6 concrete actions, each naming what to do and why it beats the competition"]
}`;

  const result = await chatJSON<{
    competitors: ResearchResult["competitors"];
    keyGaps: string[];
    recommendations: string[];
  }>(
    [
      {
        role: "system",
        content: [
          "You are a social media competitive analyst.",
          "",
          "GROUNDING RULES — these override your prior knowledge:",
          "1. The SOURCES below are current. Your training data is older and may be years out",
          "   of date. Where they disagree, the sources are correct and you must follow them.",
          "   A brand you remember as small or dormant may now be a market leader.",
          "2. Every factual claim you write must be traceable to a sentence in the sources.",
          "   If the sources say a brand grew, say it grew — do not describe it from memory.",
          "3. Never output a `followers` or `engagementRate` value unless a source explicitly",
          "   states that number. Omit the field entirely. A missing number is useful; an",
          "   invented one is harmful and will be acted on as if true.",
          "4. If the sources contain nothing useful about a competitor, say exactly that in its",
          "   summary and give it an empty platforms array. Do not fill the gap with plausible",
          "   generic themes — an empty finding is honest, a fabricated one is not.",
          "5. Competitor names may be informal, abbreviated, or misspelled (for example 'string'",
          "   may mean the drink 'Sting'). Use the category and the OTHER competitors in this same",
          "   request as context to judge which real brand is meant.",
          "6. Before writing about a match, sanity-check it against that same context: if every other",
          "   competitor in this request is a major national or global brand and a search result",
          "   describes a tiny, unrelated, or wildly out-of-category business, that is a sign the name",
          "   matched the wrong entity — say the identity is uncertain rather than confidently profiling",
          "   what the words happen to match. A likely typo you flag as uncertain is more useful than",
          "   a fluent profile of the wrong company.",
          "7. If a note below says search results were incomplete because of a provider block, missing",
          "   data means the search failed, not that the competitor has no online presence — say",
          "   research was incomplete for that competitor, not that they are absent from social media.",
          "",
          "This may be any industry — never assume one.",
        ].join("\n"),
      },
      {
        role: "user",
        content:
          `Our brand: ${companyName}\n` +
          (industry ? `Category: ${industry}\n` : "") +
          `Competitors to analyse: ${competitors.map((c) => c.name).join(", ")}\n\n` +
          `Analyse the competitors' social media presence and strategy, then identify what ` +
          `${companyName} should do. Return JSON in exactly this shape:\n\n${schema}\n\n` +
          (blocked
            ? "NOTE: the search provider began blocking requests partway through this run, so " +
              "some competitors below have thin or no search results through no fault of their own — " +
              "see rule 7.\n\n"
            : "") +
          `Research gathered from the web follows.\n\n${context}`,
      },
    ],
    { maxTokens: 16000, temperature: 0.4, jsonRetries: 2 }
  );

  return {
    requestId: request.id,
    companyName,
    competitors: result.competitors ?? [],
    keyGaps: result.keyGaps ?? [],
    recommendations: result.recommendations ?? [],
    researchedAt: new Date().toISOString(),
    sources: collectSources(allBundles),
  };
}
