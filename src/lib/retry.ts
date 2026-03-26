/**
 * Exponential backoff retry with optional full-jitter.
 *
 * Delay formula: min(baseDelayMs * 2^(attempt-1), maxDelayMs)
 * With jitter:   delay * uniform(0.5, 1.0)  — avoids thundering herd
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Apply full jitter to spread retries (default: true). */
  jitter?: boolean;
  /** Optional predicate — return true to retry, false to throw immediately. */
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelayMs = 100,
    maxDelayMs = 5000,
    jitter = true,
    shouldRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) break;
      if (shouldRetry && !shouldRetry(err, attempt)) break;

      const exponential = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
      const delay = jitter ? exponential * (0.5 + Math.random() * 0.5) : exponential;

      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/** Retry only on network/timeout errors, not on 4xx client errors. */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof Error) {
    const retryableCodes = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'];
    return retryableCodes.some((code) => err.message.includes(code));
  }
  return false;
}
