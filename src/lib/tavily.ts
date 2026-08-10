/**
 * Tavily search provider.
 *
 * Replaces the keyless DuckDuckGo scraper, which gets blocked by bot detection
 * at roughly the query volume one pipeline run produces. Two things change:
 *
 *   1. It's an API with a key, so there's nothing to throttle or trip. The
 *      1500ms spacing and circuit breaker in websearch.ts exist only for the
 *      scraper and are skipped entirely on this path.
 *   2. It returns extracted page text alongside each result, so the separate
 *      round of page fetches disappears. That was the other half of the burst.
 */

const ENDPOINT = "https://api.tavily.com/search";

export type TavilyResult = {
  title: string;
  url: string;
  /** Short snippet — always present. */
  content: string;
  /** Full extracted page text, when requested. */
  rawContent?: string;
};

/**
 * A bad key must be loud. If it returned "no results" like a transient failure
 * does, the pipeline would report "this brand has no web presence" — the exact
 * misdiagnosis the DuckDuckGo block used to cause.
 */
export class TavilyAuthError extends Error {
  constructor(status: number) {
    super(
      `Tavily rejected the API key (HTTP ${status}). Check TAVILY_API_KEY in ` +
        `web/.env.local — it should start with "tvly-".`,
    );
    this.name = "TavilyAuthError";
  }
}

export function isTavilyConfigured(): boolean {
  return (process.env.TAVILY_API_KEY ?? "").trim().length > 0;
}

/**
 * One search. Returns [] on transient failures so a single bad query degrades
 * the report rather than aborting a run that has already done real work;
 * throws on auth failures, which never fix themselves.
 */
export async function tavilySearch(
  query: string,
  { limit = 6, includeContent = true }: { limit?: number; includeContent?: boolean } = {},
): Promise<TavilyResult[]> {
  const apiKey = (process.env.TAVILY_API_KEY ?? "").trim();
  if (!apiKey) return [];

  // One retry only: the pipeline runs ~20 searches per stage and a long retry
  // ladder on each would cost more time than the results are worth.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          // "basic" costs 1 credit vs 2 for "advanced" — plenty for this.
          search_depth: "basic",
          max_results: Math.max(1, Math.min(20, limit)),
          ...(includeContent ? { include_raw_content: "markdown" } : {}),
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (res.status === 401 || res.status === 403) {
        throw new TavilyAuthError(res.status);
      }

      // Rate limit or server error: worth one retry, then give up quietly.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        return [];
      }

      if (!res.ok) return [];

      const body = (await res.json()) as {
        results?: { title?: string; url?: string; content?: string; raw_content?: string }[];
      };

      return (body.results ?? [])
        .filter((r): r is { url: string } & typeof r => Boolean(r?.url))
        .map((r) => ({
          title: (r.title ?? r.url).trim(),
          url: r.url,
          content: (r.content ?? "").trim(),
          rawContent: r.raw_content?.trim() || undefined,
        }));
    } catch (e) {
      if (e instanceof TavilyAuthError) throw e;
      if (attempt === 0) continue;
      return [];
    }
  }

  return [];
}
