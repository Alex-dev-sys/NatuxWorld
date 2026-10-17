import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const policyPath = fileURLToPath(new URL('../config/launcher-release-policy.json', import.meta.url));

function booleanOverride(env, key, fallback) {
  const value = (env[key] ?? '').trim().toLowerCase();
  if (!value) return fallback;
  if (value !== 'true' && value !== 'false') throw new Error(`${key} must be true or false.`);
  return value === 'true';
}

export function resolveReleasePolicy(source, env = {}) {
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || Object.keys(source).some((key) => !['tauri', 'migrationEnabled', 'rolloutPct'].includes(key))
    || typeof source.tauri !== 'boolean' || typeof source.migrationEnabled !== 'boolean'
    || !Number.isInteger(source.rolloutPct) || source.rolloutPct < 0 || source.rolloutPct > 100) {
    throw new Error('launcher-release-policy.json must explicitly define tauri, migrationEnabled and rolloutPct (0 through 100).');
  }
  const tauri = booleanOverride(env, 'TAURI_UPDATES_ENABLED', source.tauri);
  const migrationEnabled = booleanOverride(env, 'TAURI_MIGRATION_ENABLED', source.migrationEnabled);
  const rollout = (env.TAURI_ROLLOUT_PCT ?? '').trim();
  if (rollout && (!/^(0|[1-9]\d{0,2})$/.test(rollout) || Number(rollout) > 100)) {
    throw new Error('TAURI_ROLLOUT_PCT must be an integer from 0 to 100.');
  }
  if (migrationEnabled && !tauri) {
    throw new Error('TAURI_MIGRATION_ENABLED requires Tauri releases to be enabled.');
  }
  return { tauri, migrationEnabled, rolloutPct: rollout ? Number(rollout) : source.rolloutPct };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = JSON.parse(await readFile(policyPath, 'utf8'));
  process.stdout.write(`${JSON.stringify(resolveReleasePolicy(source, process.env))}\n`);
}
