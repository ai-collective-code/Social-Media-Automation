/**
 * Retry with exponential backoff and jitter.
 *
 * `llm.ts` already had this logic inline for chat calls; the image providers
 * had none, so a single transient 429 from a free tier failed the whole
 * generation and the user saw a dead card. This is the shared version — the
 * caller decides which failures are worth retrying, because "retryable" means
 * something different per provider (a content-policy refusal must never be
 * retried, a rate limit always should).
 */

export type RetryOptions = {
  /** Attempts after the first. Three retries means up to four calls. */
  retries?: number;
  /** Delay before the first retry; doubles each time. */
  baseDelayMs?: number;
  /** Ceiling per wait, so a long backoff can't strand a batch. */
  maxDelayMs?: number;
  /** Return false to fail immediately — a refusal is not a transient fault. */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each wait, for progress reporting. */
  onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  signal?: AbortSignal;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 1_000,
    maxDelayMs = 20_000,
    isRetryable = () => true,
    onRetry,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (signal?.aborted) throw new Error("Cancelled");
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !isRetryable(error)) throw error;

      // Jitter matters when a batch retries together: without it every queued
      // image wakes at the same instant and earns a second round of 429s.
      const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const delay = Math.round(exponential * (0.75 + Math.random() * 0.5));
      onRetry?.(attempt + 1, delay, error);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
