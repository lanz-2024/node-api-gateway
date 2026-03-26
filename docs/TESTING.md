# Testing

## Prerequisites

- Node.js 22+
- pnpm 9+
- No external services required — tests run fully offline using mock adapters

```bash
pnpm install
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm test` | Run all tests once (no watch) |
| `pnpm test:unit` | Unit tests only (src/lib, src/middleware) |
| `pnpm test:coverage` | Generate coverage report in `coverage/` |
| `pnpm test:ci` | CI mode: no watch, JUnit XML output to `test-results/` |

## Test Structure

```
tests/
├── unit/
│   ├── circuit-breaker.test.ts   # State machine transitions
│   ├── data-loader.test.ts        # Batching behavior
│   ├── rate-limiter.test.ts       # Token bucket logic
│   ├── cache.test.ts              # Cache-aside hit/miss/stale
│   └── auth.test.ts               # JWT and API key validation
└── integration/
    ├── products.test.ts           # Full request cycle with mock WC
    ├── search.test.ts             # Algolia mock responses
    └── health.test.ts             # /health and /ready endpoints
```

## Coverage Targets

| Area | Target |
|------|--------|
| src/lib/ | 90%+ |
| src/middleware/ | 85%+ |
| src/routes/ | 80%+ |
| src/services/ | 75%+ |
| Overall | 80%+ |

Run `pnpm test:coverage` to see the HTML report at `coverage/index.html`.

## Key Test Scenarios

### Circuit Breaker
- Starts in CLOSED state
- Transitions to OPEN after `failureThreshold` consecutive failures
- Rejects calls immediately when OPEN (fast fail)
- Transitions to HALF_OPEN after `resetTimeout` ms
- Returns to CLOSED on first success in HALF_OPEN
- Returns to OPEN on first failure in HALF_OPEN

### DataLoader
- 10 individual `load(id)` calls within one tick → 1 batch fetch
- Batch function receives deduplicated IDs
- Correct values mapped back to each caller
- Cache hit within same tick avoids re-fetch

### Rate Limiter
- First 100 requests within 60s window succeed
- Request 101 receives 429 Too Many Requests
- Bucket refills after window expires
- Different IPs have independent buckets

## Debugging Failing Tests

**Test hangs**: likely an unclosed async resource. Run with `--reporter=verbose` to identify which test last ran.

**Flaky circuit breaker tests**: the state machine uses wall-clock time for `resetTimeout`. Tests that rely on timing should use `vi.useFakeTimers()` to advance time deterministically.

**Mock not called**: verify the mock is set up before the module under test is imported. Use `vi.mock()` at the top of the file, not inside `beforeEach`.

**Coverage gaps**: run `pnpm test:coverage` and open `coverage/index.html`. Red lines indicate uncovered branches — common culprits are error paths and Redis fallback logic.
