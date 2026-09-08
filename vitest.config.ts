import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
