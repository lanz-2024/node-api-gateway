# Circuit Breaker

## Problem

When a downstream API (WooCommerce or Algolia) becomes slow or unavailable, requests pile up waiting for timeouts. Without a circuit breaker, every request blocks for the full timeout duration, exhausting the thread pool and cascading the failure to all clients.

## State Machine

```
              failure >= threshold
CLOSED ──────────────────────────────► OPEN
  ▲                                      │
  │ success                              │ resetTimeout elapsed
  │                                      ▼
  └──────────────────────────────── HALF_OPEN
              success
```

### States

| State | Behavior |
|-------|----------|
| CLOSED | Normal operation. Calls pass through. Failures are counted. |
| OPEN | Fast fail. All calls rejected immediately with `CircuitOpenError`. No upstream calls made. |
| HALF_OPEN | One probe call is allowed through. Success → CLOSED. Failure → OPEN (resetTimeout resets). |

## Configuration

```typescript
const breaker = new CircuitBreaker({
  failureThreshold: 5,      // consecutive failures before opening
  successThreshold: 1,      // successes in HALF_OPEN before closing
  resetTimeout: 30_000,     // ms to wait in OPEN before attempting HALF_OPEN
  timeout: 5_000,           // ms before a call is considered failed
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `failureThreshold` | 5 | Consecutive failures required to open the circuit |
| `successThreshold` | 1 | Successes in HALF_OPEN required to close the circuit |
| `resetTimeout` | 30000 | Milliseconds the circuit stays OPEN before probing |
| `timeout` | 5000 | Call timeout in milliseconds |

## Usage

```typescript
import { CircuitBreaker } from '../lib/circuit-breaker.js';

const breaker = new CircuitBreaker({ failureThreshold: 5, resetTimeout: 30_000 });

// Wrap any async operation
const result = await breaker.execute(async () => {
  return fetch('https://api.example.com/products');
});
```

The `execute()` method throws `CircuitOpenError` when the circuit is OPEN. Callers should catch this and return a cached response or an appropriate fallback.

## Monitoring

The breaker exposes its current state via `breaker.state` and counts via `breaker.stats`:

```typescript
{
  state: 'OPEN',
  failures: 5,
  successes: 0,
  lastFailureTime: 1711500000000,
  nextAttemptTime: 1711500030000
}
```

These values are included in the `/ready` response under `services.woocommerce` and `services.algolia`.

## Implementation Location

`src/lib/circuit-breaker.ts`
