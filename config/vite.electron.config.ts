import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const electronApp = path.join(root, 'build', 'electron-app');
const electronOutput = path.join(root, 'build', 'electron-output');
const optionalRequire = createRequire(path.join(root, 'electron', 'package.json'));
export default defineConfig(async ({ command }) => {
  const localMode = command === 'serve' && process.env.NATUX_LOCAL_MODE === 'true';
  const { default: electron } = await import(pathToFileURL(optionalRequire.resolve('vite-plugin-electron/dist/simple.mjs')).href);
  // Both watchers share this hook: stage after main and preload are ready, then
  // launch the generated legacy identity with its native lock resources.
  const onstart = async ({ startup }: { startup: (argv: string[], options?: object, pkg?: string) => Promise<void> }) => {
    const { cp } = await import('node:fs/promises');
    await cp(path.join(electronOutput, 'dist-electron'), path.join(electronApp, 'dist-electron'), { recursive: true });
    await startup([electronApp], { cwd: root }, pathToFileURL(optionalRequire.resolve('electron')).href);
  };
  const runtimeDependencies = ['@xhayper/discord-rpc', 'electron-updater', 'yauzl'];

  return {
    root,
    define: {
      __NATUX_LOCAL_MODE__: JSON.stringify(localMode),
    },
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          onstart,
          vite: {
            build: {
              outDir: path.join(electronOutput, 'dist-electron'),
              rollupOptions: {
                external: (id: string) => runtimeDependencies.some((name) => id === name || id.startsWith(`${name}/`)),
              },
            },
          },
        },
        preload: {
          input: path.join(root, 'electron/preload.ts'),
          onstart,
          vite: {
            build: {
              outDir: path.join(electronOutput, 'dist-electron'),
              rollupOptions: {
                output: {
                  // Sandboxed preloads can't be ESM — Electron requires CJS there.
                  format: 'cjs',
                  entryFileNames: 'preload.cjs',
                },
              },
            },
          },
        },
        renderer: process.env.NODE_ENV === 'test' ? undefined : {},
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
    server: {
      port: 5173,
    },
    build: {
      outDir: path.join(electronOutput, 'dist'),
      emptyOutDir: true,
    },
  };
});
