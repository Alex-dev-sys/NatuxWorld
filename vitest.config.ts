import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['electron/**/__tests__/**/*.test.ts', 'src/**/__tests__/**/*.test.{ts,tsx}'],
    // Default to node; renderer (.tsx) tests get jsdom. A file may still override
    // per-file with `// @vitest-environment jsdom`.
    environment: 'node',
    environmentMatchGlobs: [
      ['src/**/*.test.tsx', 'jsdom'],
      ['electron/**', 'node'],
    ],
    globals: false,
  },
});
