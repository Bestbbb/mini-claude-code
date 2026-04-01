/**
 * Exponential backoff retry logic for API calls.
 * Handles 429 (rate limit) and 529 (overloaded) errors.
 * Mirrors Claude Code's src/services/api/withRetry.ts
 */

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (attempt: number, delayMs: number, error: any) => void;
};

type RetryableError = {
  status?: number;
  headers?: { get?: (name: string) => string | null; "retry-after"?: string };
  error?: { type?: string };
  message?: string;
};

const RETRYABLE_STATUS_CODES = new Set([429, 529, 500, 502, 503]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }

      const delayMs = calculateDelay(err, attempt, baseDelayMs, maxDelayMs);
      onRetry?.(attempt + 1, delayMs, err);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function isRetryable(error: RetryableError): boolean {
  if (error.status && RETRYABLE_STATUS_CODES.has(error.status)) {
    return true;
  }
  // Network errors
  if (error.message?.includes("ECONNRESET") ||
      error.message?.includes("ETIMEDOUT") ||
      error.message?.includes("fetch failed")) {
    return true;
  }
  // Anthropic overloaded error type
  if (error.error?.type === "overloaded_error") {
    return true;
  }
  return false;
}

function calculateDelay(
  error: RetryableError,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  // Check for retry-after header
  const retryAfter = getRetryAfter(error);
  if (retryAfter !== null) {
    return Math.min(retryAfter * 1000, maxDelayMs);
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponentialDelay + jitter, maxDelayMs);
}

function getRetryAfter(error: RetryableError): number | null {
  // Try to get retry-after from headers
  const headerValue = error.headers?.get?.("retry-after") ?? error.headers?.["retry-after"];
  if (headerValue) {
    const seconds = parseFloat(headerValue);
    if (!isNaN(seconds)) return seconds;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
