import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules', 'dist', 'tests', 'src/index.ts', '**/*.d.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
    reporters: process.env['CI'] ? ['junit', 'verbose'] : ['verbose'],
    outputFile: process.env['CI'] ? 'test-results/junit.xml' : undefined,
    testTimeout: 10000,
    hookTimeout: 10000,
    pool: 'forks',
  },
  resolve: {
    conditions: ['node'],
  },
});
