import { defineConfig } from 'vitest/config';

// Opt-in config for the live end-to-end launch harness (real network + spawns Minecraft).
// Run: npx vitest run --config vitest.e2e.config.ts
export default defineConfig({
  test: {
    include: ['electron/**/__tests__/**/*.real.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 1200000,
    hookTimeout: 60000,
  },
});
