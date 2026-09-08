/**
 * Public build-time identity of the server platform.
 * Set NEXT_PUBLIC_* values in .env before a branded production build.
 */
/**
 * `??` only covers undefined, but a Docker build arg that was never passed
 * arrives as an EMPTY STRING — which then won a `??` and produced values like
 * `https://` (and `new URL()` throwing on it). Treat blank as unset.
 */
function envOr(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

const siteDomain = envOr(process.env.NEXT_PUBLIC_SITE_DOMAIN, 'vibestudy.ru')

export const BRAND = Object.freeze({
  name: envOr(process.env.NEXT_PUBLIC_SERVER_NAME, 'NATUX WORLD'),
  siteDomain,
  siteOrigin: `https://${siteDomain}`,
  serverHost: envOr(process.env.NEXT_PUBLIC_SERVER_IP, 'mc.vibestudy.ru'),
  serverVersion: envOr(process.env.NEXT_PUBLIC_SERVER_VERSION, '1.20.1 - 1.21.x'),
})
