/**
 * Keyless web search + page fetch, run server-side.
 *
 * An LLM has no internet access on its own — not GLM, not Claude. What makes
 * research possible is *tools*. This module is that toolset, so the pipeline
 * can work from real pages instead of the model's training recall (which for
 * follower counts and market share would be confident invention).
 *
 * Uses DuckDuckGo Lite, which needs no API key. That keeps the app running
 * with only LLM_API_KEY configured. If DDG ever changes its markup or starts
 * rate-limiting, swapping in Tavily/Serper/Brave means replacing searchWeb()
 * only — callers are unaffected.
 */

import { isTavilyConfigured, tavilySearch } from "@/lib/tavily";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

export type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hosts that never carry useful research content. */
const JUNK_HOST = /duckduckgo|google\.|bing\.|facebook\.com|twitter\.com|x\.com\/|pinterest\./i;

/**
 * Drop junk hosts and keep at most one result per domain, so a sample stays
 * broad instead of returning ten pages from whichever site ranks well. The
 * scraper does this inline while parsing; this is the same rule for results
 * that arrive already structured.
 */
function dedupeByHost<T extends { url: string }>(items: T[], limit: number): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (JUNK_HOST.test(item.url)) continue;
    let host: string;
    try {
      host = new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (seen.has(host)) continue;
    seen.add(host);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * DuckDuckGo Lite's anti-bot page for this exact request shape: HTTP 202,
 * a normal-looking page shell, but zero result rows. Confirmed by direct
 * inspection — a burst of ~18 concurrent requests (one research run) was
 * enough to trigger it, and it does not clear on its own for several
 * minutes. A plain "0 results" check can't tell this apart from a genuinely
 * empty search, so it's matched on page content instead.
 */
function isBlockPage(html: string): boolean {
  return /anomaly/i.test(html) && !/result-link|class="results"/i.test(html);
}

/**
 * Once DDG blocks us, every immediate retry just extends the block and burns
 * the pipeline's time budget on calls that cannot succeed. This is a
 * process-lifetime circuit breaker: after a block is detected, every search
 * short-circuits to [] for a cooldown window instead of hitting the network.
 */
let blockedUntil = 0;
const BLOCK_COOLDOWN_MS = 10 * 60_000;

/**
 * Requests are serialized with spacing rather than fired concurrently. The
 * research step used to launch every query for every competitor via
 * Promise.all — 15-18 simultaneous requests to the same endpoint from one
 * run — which is exactly the burst pattern that tripped the block above.
 * Routing every call through one queue means callers can still write
 * Promise.all and get correct results; the spacing happens centrally.
 */
let searchQueue: Promise<void> = Promise.resolve();
const MIN_SPACING_MS = 1500;

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const result = searchQueue.then(async () => {
    const jitter = Math.random() * 500;
    await new Promise((r) => setTimeout(r, MIN_SPACING_MS + jitter));
    return fn();
  });
  // Chain continues regardless of this call's outcome, or one failure would
  // wedge every query behind it for the rest of the process.
  searchQueue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

/**
 * Search the web. Returns [] rather than throwing — a failed search should
 * degrade the report, not abort a pipeline that has already done real work.
 */
export async function searchWeb(query: string, limit = 8): Promise<SearchResult[]> {
  // Tavily path: a real API, so no spacing and no circuit breaker. Auth errors
  // deliberately propagate — see the note in tavily.ts.
  if (isTavilyConfigured()) {
    const found = await tavilySearch(query, { limit, includeContent: false });
    return dedupeByHost(found.map((r) => ({ title: r.title, url: r.url })), limit);
  }

  if (Date.now() < blockedUntil) return [];

  return throttled(async () => {
    try {
      const res = await fetch("https://lite.duckduckgo.com/lite/", {
        method: "POST",
        headers: {
          "User-Agent": UA,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "text/html",
        },
        body: new URLSearchParams({ q: query }).toString(),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) return [];
      const html = await res.text();

      if (isBlockPage(html)) {
        blockedUntil = Date.now() + BLOCK_COOLDOWN_MS;
        return [];
      }

      const seen = new Set<string>();
      const out: SearchResult[] = [];

      for (const m of html.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g)) {
        let url = m[1];
        // DDG sometimes wraps targets in a redirect carrying the real URL.
        const wrapped = url.match(/[?&]uddg=([^&]+)/);
        if (wrapped) url = decodeURIComponent(wrapped[1]);

        const title = decodeEntities(m[2]);
        if (!title || title.length < 12) continue;
        if (JUNK_HOST.test(url)) continue;

        // One result per host keeps the sample broad instead of ten pages
        // from whichever site happens to rank well.
        let host: string;
        try {
          host = new URL(url).hostname.replace(/^www\./, "");
        } catch {
          continue;
        }
        if (seen.has(host)) continue;
        seen.add(host);

        out.push({ title, url });
        if (out.length >= limit) break;
      }
      return out;
    } catch {
      return [];
    }
  });
}

/**
 * True while the circuit breaker is open — lets callers surface it to the UI.
 * Always false on the Tavily path: the breaker is a scraper-only concept, and
 * reporting it there would blame a block for an ordinary empty result.
 */
export function isSearchBlocked(): boolean {
  if (isTavilyConfigured()) return false;
  return Date.now() < blockedUntil;
}

/** Fetch one page and reduce it to readable text. Returns "" on any failure. */
export async function fetchPageText(url: string, maxChars = 6000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) return "";

    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return "";

    const html = await res.text();
    const text = html
      // Drop non-content nodes before stripping tags, or their contents survive.
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ");

    return decodeEntities(text).slice(0, maxChars);
  } catch {
    return "";
  }
}

export type ResearchBundle = {
  query: string;
  results: SearchResult[];
  /** Page text keyed by URL, for whichever pages fetched successfully. */
  pages: { url: string; title: string; text: string }[];
};

/**
 * Search, then read the top pages — the unit of work a research step needs.
 *
 * Pages are fetched concurrently because each is an independent network wait;
 * doing them serially would add tens of seconds per query for no benefit.
 */
export async function researchQuery(
  query: string,
  { results = 6, readTop = 3, maxCharsPerPage = 6000 } = {}
): Promise<ResearchBundle> {
  // Tavily returns extracted page text with the results, so there is no second
  // round of fetches here — that round was half the request volume that got
  // the scraper blocked, and skipping it also cuts most of the wall-clock time.
  if (isTavilyConfigured()) {
    const found = dedupeByHost(await tavilySearch(query, { limit: results }), results);
    const pages = found
      .slice(0, readTop)
      .map((r) => ({
        url: r.url,
        title: r.title,
        // Fall back to the snippet when a page had no extractable body.
        text: (r.rawContent ?? r.content).slice(0, maxCharsPerPage),
      }))
      .filter((p) => p.text.length > 200);

    return {
      query,
      results: found.map((r) => ({ title: r.title, url: r.url, snippet: r.content })),
      pages,
    };
  }

  const found = await searchWeb(query, results);
  const toRead = found.slice(0, readTop);

  const pages = (
    await Promise.all(
      toRead.map(async (r) => ({
        url: r.url,
        title: r.title,
        text: await fetchPageText(r.url, maxCharsPerPage),
      }))
    )
  ).filter((p) => p.text.length > 200);

  return { query, results: found, pages };
}

/** Flatten bundles into a prompt-ready block with sources attributed. */
export function bundlesToContext(bundles: ResearchBundle[]): string {
  const parts: string[] = [];
  for (const b of bundles) {
    parts.push(`### Search: ${b.query}`);
    if (b.results.length === 0) {
      parts.push("(no results returned)");
      continue;
    }
    for (const r of b.results) parts.push(`- ${r.title} — ${r.url}`);
    for (const p of b.pages) {
      parts.push("", `#### Source: ${p.title}`, `URL: ${p.url}`, p.text);
    }
    parts.push("");
  }
  return parts.join("\n");
}

/** Every URL seen, for the report's source list. */
export function collectSources(bundles: ResearchBundle[]): string[] {
  const urls = new Set<string>();
  for (const b of bundles) for (const r of b.results) urls.add(r.url);
  return [...urls];
}
