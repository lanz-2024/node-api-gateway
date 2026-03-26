/**
 * Circuit Breaker — CLOSED → OPEN → HALF_OPEN → CLOSED state machine.
 *
 * Prevents cascading failures by fast-failing calls to an unhealthy downstream
 * service and periodically probing for recovery.
 *
 * States:
 *   CLOSED    — Normal operation. Failures are counted.
 *   OPEN      — Fast-fail mode. No calls pass through until timeout elapses.
 *   HALF_OPEN — Probe mode. A limited number of calls are let through;
 *               consecutive successes close the circuit, any failure reopens it.
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before opening the circuit. */
  threshold: number;
  /** Milliseconds to wait in OPEN state before entering HALF_OPEN. */
  timeout: number;
  /** Consecutive successes required in HALF_OPEN to return to CLOSED. */
  successThreshold?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private successes = 0;
  private nextAttempt = 0;

  private readonly threshold: number;
  private readonly timeout: number;
  private readonly successThreshold: number;

  constructor(
    private readonly name: string,
    options: CircuitBreakerOptions,
  ) {
    this.threshold = options.threshold;
    this.timeout = options.timeout;
    this.successThreshold = options.successThreshold ?? 2;
  }

  get currentState(): CircuitState {
    return this.state;
  }

  get stats(): { state: CircuitState; failures: number; successes: number; nextAttempt: number } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      nextAttempt: this.nextAttempt,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
      // Timeout elapsed — probe with one request
      this.state = 'HALF_OPEN';
      this.successes = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'HALF_OPEN') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successes = 0;
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      this.failures = 0;
      this.successes = 0;
    }
  }
}
