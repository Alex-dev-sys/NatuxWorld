import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

const root = process.cwd();
export default defineConfig(({ command }) => {
  const localMode = command === 'serve' && process.env.NATUX_LOCAL_MODE === 'true';

  return {
    root,
    clearScreen: false,
    define: {
      __NATUX_LOCAL_MODE__: JSON.stringify(localMode),
    },
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: path.resolve(root, 'dist'),
      emptyOutDir: true,
    },
  };
});
