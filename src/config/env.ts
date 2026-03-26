import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32).default('dev-secret-at-least-32-chars-long!!'),
  REDIS_URL: z.string().url().optional(),
  WC_BASE_URL: z.string().url().default('http://localhost:8080'),
  WC_CONSUMER_KEY: z.string().default('mock-key'),
  WC_CONSUMER_SECRET: z.string().default('mock-secret'),
  ALGOLIA_APP_ID: z.string().default('mock-algolia-app'),
  ALGOLIA_API_KEY: z.string().default('mock-algolia-key'),
  RATE_LIMIT_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  CIRCUIT_BREAKER_THRESHOLD: z.coerce.number().default(5),
  CIRCUIT_BREAKER_TIMEOUT_MS: z.coerce.number().default(30000),
  CACHE_TTL_SECONDS: z.coerce.number().default(60),
});

export type Env = z.infer<typeof envSchema>;

const result = envSchema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment variables:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;
