/**
 * OpenAI image generation (gpt-image).
 *
 * Unlike Canva — real image generation only, no editable design, no template
 * system, no OAuth. Canva's Connect API was evaluated and rejected for this:
 * it has no API-key mode at all (OAuth 2.0 with per-user consent is the only
 * path), and its scope is assembling designs from templates, not prompt-based
 * generation. This is a plain REST call with one key, returning a real file
 * immediately — no queue, no separate session required to complete it.
 */

const ENDPOINT = "https://api.openai.com/v1/images/generations";

export const DEFAULT_IMAGE_MODEL = "gpt-image-2";

/** Portrait, closest preset to the 4:5 Instagram feed ratio this app targets. */
const DEFAULT_SIZE = "1024x1536";

export function isOpenAiImageConfigured(): boolean {
  return (process.env.OPENAI_API_KEY ?? "").trim().length > 0;
}

export type GeneratedImage = {
  /** Raw PNG bytes, decoded from the API's base64 response. */
  bytes: Buffer;
  width: number;
  height: number;
};

/** A bad key or a rejected prompt must be loud, not silently empty-handed. */
export class OpenAiImageError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "policy" | "other" = "other",
  ) {
    super(message);
    this.name = "OpenAiImageError";
  }
}

export async function generateImage(
  prompt: string,
  { size = DEFAULT_SIZE, quality = "medium" }: { size?: string; quality?: "low" | "medium" | "high" } = {},
): Promise<GeneratedImage> {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) throw new OpenAiImageError("OPENAI_API_KEY is not set.", "auth");

  const model = (process.env.OPENAI_IMAGE_MODEL ?? "").trim() || DEFAULT_IMAGE_MODEL;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
    // Image generation is slower than a chat call; generous but bounded.
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}) as Record<string, unknown>);
    const message =
      (body as { error?: { message?: string } }).error?.message ??
      `OpenAI image request failed (HTTP ${res.status}).`;

    if (res.status === 401 || res.status === 403) {
      throw new OpenAiImageError(
        `OpenAI rejected the API key (HTTP ${res.status}). Check OPENAI_API_KEY in web/.env.local.`,
        "auth",
      );
    }
    // 400 with a content-policy code is the model refusing the prompt itself,
    // not a transient failure — worth telling apart from "try again later".
    if (res.status === 400 && /safety|policy|content/i.test(message)) {
      throw new OpenAiImageError(
        `OpenAI declined this prompt: ${message}`,
        "policy",
      );
    }
    throw new OpenAiImageError(message);
  }

  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) {
    throw new OpenAiImageError("OpenAI returned no image data.");
  }

  const [w, h] = size.split("x").map(Number);
  return {
    bytes: Buffer.from(b64, "base64"),
    width: Number.isFinite(w) ? w : 1024,
    height: Number.isFinite(h) ? h : 1536,
  };
}
