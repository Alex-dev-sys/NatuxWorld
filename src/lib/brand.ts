/**
 * Public build-time identity of the server platform.
 * Set NEXT_PUBLIC_* values in .env before a branded production build.
 */
const siteDomain = process.env.NEXT_PUBLIC_SITE_DOMAIN ?? 'vibestudy.ru'

export const BRAND = Object.freeze({
  name: process.env.NEXT_PUBLIC_SERVER_NAME ?? 'NATUX WORLD',
  siteDomain,
  siteOrigin: `https://${siteDomain}`,
  serverHost: process.env.NEXT_PUBLIC_SERVER_IP ?? 'mc.vibestudy.ru',
  serverVersion: process.env.NEXT_PUBLIC_SERVER_VERSION ?? '1.20.1 - 1.21.x',
})
