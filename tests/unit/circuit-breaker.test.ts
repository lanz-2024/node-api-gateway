/**
 * Circuit breaker state machine unit tests.
 *
 * Covers every transition:
 *   CLOSED  → OPEN      (threshold failures)
 *   OPEN    → HALF_OPEN (timeout elapses)
 *   HALF_OPEN → CLOSED  (successThreshold successes)
 *   HALF_OPEN → OPEN    (any failure)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../src/lib/circuit-breaker.js';

function makeBreaker(threshold = 3, timeout = 1000, successThreshold = 2) {
  return new CircuitBreaker('test', { threshold, timeout, successThreshold });
}

const ok = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('boom'));

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  // ── Initial state ──────────────────────────────────────────────────────────

  it('starts CLOSED', () => {
    expect(makeBreaker().currentState).toBe('CLOSED');
  });

  it('allows calls through when CLOSED', async () => {
    const cb = makeBreaker();
    await expect(cb.execute(ok)).resolves.toBe('ok');
  });

  // ── CLOSED → OPEN ──────────────────────────────────────────────────────────

  it('opens after threshold consecutive failures', async () => {
    const cb = makeBreaker(3);
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => null);
    }
    expect(cb.currentState).toBe('OPEN');
  });

  it('does not open before threshold is reached', async () => {
    const cb = makeBreaker(3);
    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);
    expect(cb.currentState).toBe('CLOSED');
  });

  it('resets failure count on success while CLOSED', async () => {
    const cb = makeBreaker(3);
    await cb.execute(fail).catch(() => null);
    await cb.execute(ok); // resets count
    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);
    // only 2 consecutive failures — still closed
    expect(cb.currentState).toBe('CLOSED');
  });

  // ── OPEN fast-fails ────────────────────────────────────────────────────────

  it('fast-fails immediately when OPEN', async () => {
    const cb = makeBreaker(2);
    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);
    expect(cb.currentState).toBe('OPEN');

    await expect(cb.execute(ok)).rejects.toThrow('OPEN');
  });

  // ── OPEN → HALF_OPEN ───────────────────────────────────────────────────────

  it('transitions to HALF_OPEN after timeout elapses', async () => {
    vi.useFakeTimers();
    const cb = makeBreaker(2, 500);

    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);
    expect(cb.currentState).toBe('OPEN');

    vi.advanceTimersByTime(501);

    // Next call probes — success transitions to HALF_OPEN (then counts successes)
    await cb.execute(ok).catch(() => null);
    expect(['HALF_OPEN', 'CLOSED']).toContain(cb.currentState);
    vi.useRealTimers();
  });

  it('stays OPEN before timeout elapses', async () => {
    vi.useFakeTimers();
    const cb = makeBreaker(2, 1000);

    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);

    vi.advanceTimersByTime(500); // not yet

    await expect(cb.execute(ok)).rejects.toThrow('OPEN');
    vi.useRealTimers();
  });

  // ── HALF_OPEN → CLOSED ────────────────────────────────────────────────────

  it('closes after successThreshold successes in HALF_OPEN', async () => {
    vi.useFakeTimers();
    const cb = makeBreaker(2, 100, 2);

    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);
    vi.advanceTimersByTime(101);

    // Two successes → CLOSED
    await cb.execute(ok);
    await cb.execute(ok);

    expect(cb.currentState).toBe('CLOSED');
    vi.useRealTimers();
  });

  // ── HALF_OPEN → OPEN ──────────────────────────────────────────────────────

  it('reopens on any failure in HALF_OPEN', async () => {
    vi.useFakeTimers();
    const cb = makeBreaker(2, 100, 2);

    await cb.execute(fail).catch(() => null);
    await cb.execute(fail).catch(() => null);
    vi.advanceTimersByTime(101);

    // One success, then failure → back to OPEN
    await cb.execute(ok);
    await cb.execute(fail).catch(() => null);

    expect(cb.currentState).toBe('OPEN');
    vi.useRealTimers();
  });

  // ── Stats ─────────────────────────────────────────────────────────────────

  it('exposes stats', () => {
    const cb = makeBreaker();
    const stats = cb.stats;
    expect(stats).toMatchObject({ state: 'CLOSED', failures: 0, successes: 0 });
  });
});
