/**
 * Pollinations.ai — free, keyless image generation for testing.
 *
 * No account, no billing, no request body: a GET request with the prompt in
 * the URL path returns raw image bytes directly. In exchange for "free and
 * instant", the anonymous tier watermarks output and allows one request per
 * 15 seconds — fine for trying the pipeline, not for a real client asset.
 * That's why this is opt-in (`POLLINATIONS_ENABLED`) and only used as a
 * fallback when OpenAI isn't configured — it should never silently replace a
 * paid, unwatermarked result.
 */

import { withRetry } from "@/lib/retry";

const ENDPOINT = "https://image.pollinations.ai/prompt";

export function isPollinationsEnabled(): boolean {
  return (process.env.POLLINATIONS_ENABLED ?? "").trim().toLowerCase() === "true";
}

export type GeneratedImage = {
  bytes: Buffer;
  /** "jpg" or "png" — read from the response, not assumed. */
  extension: string;
  width: number;
  height: number;
};

export class PollinationsError extends Error {
  constructor(
    message: string,
    readonly kind: "rate_limit" | "other" = "other",
  ) {
    super(message);
    this.name = "PollinationsError";
  }
}

export async function generateImage(
  prompt: string,
  {
    width = 1024,
    height = 1536,
    seed,
  }: { width?: number; height?: number; seed?: number } = {},
): Promise<GeneratedImage> {
  // No `model` parameter: the anonymous tier ignores it. Requesting "flux",
  // "sana" and "turbo" at one seed returns three byte-identical files — every
  // request is served by the same small model. Sending a name we don't get
  // only implies a choice that isn't there. Face realism is capped by that
  // model, not by the prompt; a paid provider is the only way past it.
  const url = `${ENDPOINT}/${encodeURIComponent(prompt)}?${new URLSearchParams({
    width: String(width),
    height: String(height),
    // Seeds ARE honoured — same prompt and seed returns the same image. A
    // fresh one per call is what makes "Regenerate" produce something new; a
    // brand that has pinned its seed gets a reproducible look instead.
    seed: String(seed ?? Math.floor(Math.random() * 1_000_000)),
  }).toString()}`;

  // The free tier rate-limits hard and occasionally 5xxs under load. Retrying
  // the transient cases turns "this post failed" into "this post took longer",
  // which is the difference between a usable batch and a half-empty one.
  return withRetry(
    async () => {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });

      if (res.status === 429) {
        throw new PollinationsError(
          "Pollinations' free tier allows one image every 15 seconds — wait a moment and try again.",
          "rate_limit",
        );
      }
      if (!res.ok) {
        throw new PollinationsError(`Pollinations request failed (HTTP ${res.status}).`);
      }

      const contentType = res.headers.get("content-type") ?? "";
      const extension = contentType.includes("png") ? "png" : "jpg";
      const bytes = Buffer.from(await res.arrayBuffer());

      if (bytes.length === 0) {
        throw new PollinationsError("Pollinations returned an empty response.");
      }

      return { bytes, extension, width, height };
    },
    {
      retries: 3,
      // The tier's own window is 15s, so a shorter first wait just burns an
      // attempt on a limit that hasn't reset yet.
      baseDelayMs: 16_000,
      maxDelayMs: 45_000,
      isRetryable: (error) =>
        error instanceof PollinationsError ? error.kind === "rate_limit" : true,
    },
  );
}
