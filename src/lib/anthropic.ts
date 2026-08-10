import Anthropic from "@anthropic-ai/sdk";
import type { ChatMessage, ChatOptions } from "@/lib/llm";

/**
 * Anthropic (Claude) provider.
 *
 * The rest of this codebase talks to an OpenAI-compatible `/chat/completions`
 * endpoint. Anthropic's Messages API is a different shape, so this is a real
 * adapter rather than a base-URL swap. Three differences matter:
 *
 *   1. The system prompt is a top-level `system` field, NOT a `role: "system"`
 *      message. System messages are lifted out of the array here.
 *   2. Responses are a list of typed content blocks, not `choices[0].message`.
 *   3. `max_tokens` is required on every request.
 *
 * Retries, timeouts and typed errors come from the official SDK, so none of
 * that is reimplemented.
 */

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

/**
 * Reasoning depth and token spend. Claude Opus 5 performs unusually well at
 * the lower levels, so `medium` is the default here: this pipeline runs six
 * stages back to back and latency compounds. Raise to `high` for more
 * thorough research, drop to `low` for the fastest runs.
 */
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const;
type Effort = (typeof EFFORT_LEVELS)[number];
const DEFAULT_EFFORT: Effort = "medium";

export type AnthropicConfig = {
  apiKey: string;
  model: string;
  creativeModel: string;
  effort: Effort;
};

export function getAnthropicConfig(): AnthropicConfig {
  const apiKey = (process.env.ANTHROPIC_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set — add it to web/.env.local to use Claude.",
    );
  }

  const model = (process.env.ANTHROPIC_MODEL ?? "").trim() || DEFAULT_ANTHROPIC_MODEL;
  const creativeModel = (process.env.ANTHROPIC_MODEL_CREATIVE ?? "").trim() || model;

  const requested = (process.env.ANTHROPIC_EFFORT ?? "").trim().toLowerCase();
  const effort = (EFFORT_LEVELS as readonly string[]).includes(requested)
    ? (requested as Effort)
    : DEFAULT_EFFORT;

  return { apiKey, model, creativeModel, effort };
}

/** True when ANTHROPIC_API_KEY is present, so Claude can serve requests. */
export function isAnthropicConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim().length > 0;
}

let cached: Anthropic | undefined;

function client(apiKey: string): Anthropic {
  // Reused so the SDK's connection pool survives across pipeline stages.
  if (!cached) cached = new Anthropic({ apiKey });
  return cached;
}

/**
 * Split an OpenAI-style message list into Anthropic's shape.
 *
 * Every `system` message is concatenated into the top-level system prompt,
 * in order. The remainder keeps its sequence; consecutive same-role messages
 * are fine (the API merges them into one turn), but the first message must be
 * `user`, so a leading assistant turn gets a minimal user turn in front of it.
 */
function split(messages: ChatMessage[]): {
  system: string;
  turns: Anthropic.MessageParam[];
} {
  const systemParts: string[] = [];
  const turns: Anthropic.MessageParam[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }
    turns.push({ role: message.role, content: message.content });
  }

  if (turns.length === 0) {
    throw new Error("Anthropic requires at least one user message.");
  }
  if (turns[0].role !== "user") {
    turns.unshift({ role: "user", content: "Continue." });
  }

  return { system: systemParts.join("\n\n"), turns };
}

/**
 * One chat completion via Claude. Returns the visible assistant text.
 *
 * Thinking is deliberately left at its default (adaptive on Claude Opus 5) and
 * controlled through `effort` instead. Disabling it outright is a documented
 * way to get `<thinking>` tags leaking into the response text, which would
 * break the JSON parsing every stage depends on.
 */
export async function anthropicChat(
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<string> {
  const config = getAnthropicConfig();
  const { creative = false, maxTokens = 4000, timeoutMs, maxRetries, signal } = options;

  const { system, turns } = split(messages);

  const response = await client(config.apiKey).messages.create(
    {
      model: creative ? config.creativeModel : config.model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      output_config: { effort: config.effort },
      messages: turns,
    },
    {
      // The TypeScript SDK measures timeouts in milliseconds.
      ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
      ...(maxRetries !== undefined ? { maxRetries } : {}),
      ...(signal ? { signal } : {}),
    },
  );

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  if (response.stop_reason === "refusal") {
    throw new Error(
      "Claude declined this request. Rephrasing the brand description usually resolves it.",
    );
  }

  if (!text.trim()) {
    throw new Error(
      `Claude returned no text (stop_reason: ${response.stop_reason ?? "unknown"}).`,
    );
  }

  return text.trim();
}
