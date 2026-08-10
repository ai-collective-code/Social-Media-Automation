import { chatJSON } from "@/lib/llm";
import { tavilySearch, isTavilyConfigured } from "@/lib/tavily";
import { PLATFORM_OPTIONS } from "@/lib/brand-types";

/**
 * Drafts a full brand profile from just a company name.
 *
 * The brand form's fields are exactly what every downstream prompt reads —
 * competitor discovery, every caption, every image. A blank one is the
 * highest-friction point in the whole app: nothing else can start until it's
 * filled in, and it's the one screen where "type a paragraph about your own
 * positioning" is asked of someone before they've used the product at all.
 * This fills a plausible first draft so filling in the real form becomes
 * editing, not writing from nothing.
 *
 * Grounded with a real search when the name is a real, findable company —
 * "Royal Enfield" should come back with actual facts, not a generic
 * motorcycle-brand mad-lib. Falls back to informed invention when the search
 * finds nothing, which is the normal case for a brand that doesn't exist yet.
 */

export type BrandDraft = {
  industry: string;
  domain: string;
  description: string;
  audience: string;
  markets: string;
  voice: string;
  neverSay: string;
  avoidVisuals: string;
  language: string;
  platforms: string[];
};

async function groundingContext(companyName: string): Promise<string> {
  if (!isTavilyConfigured()) return "";

  const results = await tavilySearch(`${companyName} brand company official`, { limit: 4 }).catch(
    () => [],
  );
  if (results.length === 0) return "";

  return (
    "\n\nWEB SEARCH RESULTS — use these for real facts if they clearly describe this exact " +
    "company; ignore them if they're about something else with a similar name:\n" +
    results
      .map((r) => `- ${r.title} (${r.url}): ${r.content.slice(0, 400)}`)
      .join("\n")
  );
}

export async function generateBrandDraft(companyName: string): Promise<BrandDraft> {
  const grounding = await groundingContext(companyName);

  const result = await chatJSON<BrandDraft>(
    [
      {
        role: "system",
        content: [
          "You fill in a brand profile form from just a company name, for someone setting up",
          "a social-media content pipeline. Every field you write becomes an instruction fed",
          "into an AI model later — vague filler ('great products for everyone') produces vague",
          "content later, so write like a strategist who has actually looked at this brand, not",
          "like a form being politely completed.",
          "",
          "If the web search results below clearly describe this real company, use them —",
          "real positioning, real category, a real market. If they don't (a new or fictional",
          "brand, or a name too generic to search), invent something specific and internally",
          "consistent rather than generic: pick one real angle and commit to it.",
          "",
          "Field rules:",
          "- industry: 2-5 words, the category used to find its real competitors.",
          "- domain: a plausible website, lowercase, no protocol. Empty string if genuinely unknown.",
          "- description: 2-3 sentences. What it sells and the one thing that differentiates it —",
          "  not a mission statement.",
          "- audience: who it's for, one line. Empty string if it's genuinely mass-market.",
          "- markets: comma-separated places, e.g. 'India, UAE'. Real ones if known, plausible otherwise.",
          "- voice: 3-6 words on tone, e.g. 'Warm, plain-spoken, never clinical'.",
          "- neverSay: concrete claims, words or topics this brand's category makes risky to say —",
          "  e.g. a supplement brand shouldn't make cure claims, a bank shouldn't promise guaranteed",
          "  returns. Specific to THIS brand's actual risk, not a generic disclaimer.",
          "- avoidVisuals: concrete visual bans suited to the brand's actual category and tone.",
          "- language: the primary content language, e.g. 'English' or 'Hindi'.",
          `- platforms: pick from exactly this list, only ones that fit how this brand would ` +
            `actually reach its audience: ${PLATFORM_OPTIONS.join(", ")}.`,
          "",
          'Reply as JSON with exactly these keys: industry, domain, description, audience,',
          'markets, voice, neverSay, avoidVisuals, language, platforms (a string array).',
        ].join("\n"),
      },
      {
        role: "user",
        content: `Company name: ${companyName}${grounding}`,
      },
    ],
    { creative: true, maxTokens: 1200, temperature: 0.6, jsonRetries: 2 },
  );

  return {
    industry: result.industry?.trim() ?? "",
    domain: result.domain?.trim() ?? "",
    description: result.description?.trim() ?? "",
    audience: result.audience?.trim() ?? "",
    markets: result.markets?.trim() ?? "",
    voice: result.voice?.trim() ?? "",
    neverSay: result.neverSay?.trim() ?? "",
    avoidVisuals: result.avoidVisuals?.trim() ?? "",
    language: result.language?.trim() || "English",
    platforms: Array.isArray(result.platforms)
      ? result.platforms.filter((p): p is string =>
          (PLATFORM_OPTIONS as readonly string[]).includes(p),
        )
      : [],
  };
}
