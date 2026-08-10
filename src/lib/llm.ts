/**
 * Provider-agnostic LLM client.
 *
 * Speaks the OpenAI-compatible /chat/completions protocol, which every
 * provider except Anthropic supports. Swapping provider is three env vars:
 *
 *   LLM_BASE_URL=https://integrate.api.nvidia.com/v1
 *   LLM_MODEL=z-ai/glm-5.2
 *   LLM_API_KEY=nvapi-...
 *
 * Default is GLM-5.2 on NVIDIA NIM (1M context). Notes that shaped this file:
 *
 *  - It is SLOW. A trivial prompt measured >2 minutes, because it is a
 *    reasoning model that thinks before emitting. Hence the long default
 *    timeout and why callers must run inside a background job, never inside
 *    a request/response cycle.
 *  - Reasoning models leak their scratchpad two ways: a separate
 *    `reasoning_content` field, or inline <think> tags. Both are stripped.
 *  - NVIDIA NIM defaults to ~40 requests/minute, so 429 is expected under
 *    any parallelism and is retried with backoff.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Optional stronger model for creative steps (brand voice, hooks). */
  creativeModel: string;
};

/**
 * Whether the Claude provider is available.
 *
 * Inlined rather than imported from `@/lib/anthropic` so that module — and the
 * Anthropic SDK it pulls in — stays lazily loaded behind the dynamic import in
 * `chat()`, and so there's no import cycle between the two files.
 */
function isAnthropicConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

export class LlmNotConfiguredError extends Error {
  constructor(missing: string) {
    super(
      `LLM is not configured: ${missing} is missing. Add it to web/.env.local — see .env.example.`
    );
    this.name = "LlmNotConfiguredError";
  }
}

/** Read config from env. Throws only when a call is actually attempted. */
export function getLlmConfig(): LlmConfig {
  const baseUrl = (process.env.LLM_BASE_URL ?? "").trim().replace(/\/$/, "");
  const apiKey = (process.env.LLM_API_KEY ?? "").trim();
  const model = (process.env.LLM_MODEL ?? "").trim();
  const creativeModel = (process.env.LLM_MODEL_CREATIVE ?? "").trim() || model;

  if (!apiKey) throw new LlmNotConfiguredError("LLM_API_KEY");
  if (!baseUrl) throw new LlmNotConfiguredError("LLM_BASE_URL");
  if (!model) throw new LlmNotConfiguredError("LLM_MODEL");

  return { baseUrl, apiKey, model, creativeModel };
}

/** True when a call would succeed config-wise — for rendering UI state. */
export function isLlmConfigured(): boolean {
  // Either provider is enough: Claude needs only ANTHROPIC_API_KEY, whereas
  // the OpenAI-compatible path needs a base URL and model name as well.
  if (isAnthropicConfigured()) return true;
  try {
    getLlmConfig();
    return true;
  } catch {
    return false;
  }
}

/** Which provider a call would currently use — surfaced in the UI. */
export function activeProvider(): "anthropic" | "openai-compatible" | "none" {
  if (isAnthropicConfigured()) return "anthropic";
  return isLlmConfigured() ? "openai-compatible" : "none";
}

/**
 * Strip reasoning-model artifacts from visible output.
 *
 * Reasoning models sometimes emit their scratchpad inline as <think> blocks
 * rather than in the separate reasoning_content field. Left in, that text
 * ends up rendered as if it were the answer.
 */
function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    // An unterminated opening tag means the model was cut off mid-thought;
    // everything after it is scratchpad, not answer.
    .replace(/<think(ing)?>[\s\S]*$/i, "")
    .trim();
}

/** Pull JSON out of a ```json fence, or find the outermost object/array. */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();

  const firstObj = candidate.indexOf("{");
  const firstArr = candidate.indexOf("[");
  const starts = [firstObj, firstArr].filter((i) => i !== -1);
  if (starts.length === 0) return candidate;

  const start = Math.min(...starts);
  const opener = candidate[start];
  const closer = opener === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(closer);
  return end > start ? candidate.slice(start, end + 1) : candidate.slice(start);
}

const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export type ChatOptions = {
  /** Use LLM_MODEL_CREATIVE instead of LLM_MODEL. */
  creative?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Per-attempt cap. GLM can take minutes; default 10 min. */
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
};

/** One chat completion. Returns visible assistant text, reasoning stripped. */
export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  // Claude takes precedence when configured. Dispatching here rather than in
  // each stage means chatJSON() and all six pipeline stages switch provider
  // with no changes of their own.
  if (isAnthropicConfigured()) {
    const { anthropicChat } = await import("@/lib/anthropic");
    return stripReasoning(await anthropicChat(messages, options));
  }

  const cfg = getLlmConfig();
  const {
    creative = false,
    maxTokens = 8192,
    temperature = 0.7,
    timeoutMs = 600_000,
    maxRetries = 3,
    signal,
  } = options;

  const model = creative ? cfg.creativeModel : cfg.model;
  let lastError: Error = new Error("LLM request failed");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Abort this attempt on timeout, but keep any caller-level abort authoritative.
    const timer = new AbortController();
    const timeout = setTimeout(() => timer.abort(), timeoutMs);
    const onCallerAbort = () => timer.abort();
    signal?.addEventListener("abort", onCallerAbort);

    try {
      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
        signal: timer.signal,
      });

      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 500);
        // Never surface the key, even if the provider echoes the request back.
        const safe = detail.replace(/nvapi-[\w-]+|sk-[\w-]+/g, "[redacted]");
        const err = new Error(`LLM ${res.status} from ${model}: ${safe}`);

        if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
          lastError = err;
          const retryAfter = Number(res.headers.get("retry-after"));
          const backoffMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(2 ** attempt * 2000, 30_000);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
        throw err;
      }

      const data = await res.json();
      const message = data?.choices?.[0]?.message;

      // Prefer `content`; some reasoning models put everything in
      // reasoning_content and leave content empty.
      const raw: string =
        (typeof message?.content === "string" && message.content) ||
        (typeof message?.reasoning_content === "string" && message.reasoning_content) ||
        "";

      const text = stripReasoning(raw);
      if (!text) {
        const err = new Error(
          `LLM returned empty content (finish_reason=${data?.choices?.[0]?.finish_reason ?? "?"}). ` +
            `If finish_reason is "length", raise maxTokens — reasoning tokens count toward it.`
        );
        if (attempt < maxRetries) {
          lastError = err;
          continue;
        }
        throw err;
      }
      return text;
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      // A caller-initiated abort is intentional — never retry it.
      if (signal?.aborted) throw err;
      lastError = err.name === "AbortError"
        ? new Error(`LLM request to ${model} timed out after ${timeoutMs}ms`)
        : err;
      if (attempt >= maxRetries) throw lastError;
      await new Promise((r) => setTimeout(r, Math.min(2 ** attempt * 2000, 30_000)));
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onCallerAbort);
    }
  }

  throw lastError;
}

/**
 * Chat that must return JSON matching a shape.
 *
 * Deliberately does not use the provider's structured-output mode: support is
 * inconsistent across OpenAI-compatible providers, and relying on it would
 * undo the provider-agnostic design. Prompt + extract + reparse works anywhere.
 */
export async function chatJSON<T = unknown>(
  messages: ChatMessage[],
  options: ChatOptions & { jsonRetries?: number } = {}
): Promise<T> {
  const { jsonRetries = 2, ...chatOptions } = options;
  const instruction: ChatMessage = {
    role: "system",
    content:
      "Respond with a single valid JSON value and nothing else. No prose, no " +
      "explanation, no markdown code fences around it.",
  };

  let lastText = "";
  let lastError: Error = new Error("no JSON produced");

  for (let attempt = 0; attempt <= jsonRetries; attempt++) {
    const attemptMessages: ChatMessage[] =
      attempt === 0
        ? [instruction, ...messages]
        : [
            instruction,
            ...messages,
            { role: "assistant", content: lastText.slice(0, 2000) },
            {
              role: "user",
              content: `That was not valid JSON (${lastError.message}). Return only the corrected JSON value.`,
            },
          ];

    lastText = await chat(attemptMessages, chatOptions);
    try {
      return JSON.parse(extractJson(lastText)) as T;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw new Error(
    `LLM did not return valid JSON after ${jsonRetries + 1} attempts. ` +
      `Last error: ${lastError.message}. Last output began: ${lastText.slice(0, 300)}`
  );
}
