/**
 * Single build-time source of truth for the launcher brand and its public API.
 * Change these values before producing a branded build for another server.
 */
declare const __NATUX_LOCAL_MODE__: boolean;

const localMode = typeof __NATUX_LOCAL_MODE__ !== 'undefined' && __NATUX_LOCAL_MODE__;

export const BRAND = Object.freeze({
  name: 'NATUX WORLD',
  siteOrigin: localMode ? 'http://127.0.0.1:3000' : 'https://vibestudy.ru',
  siteDomain: localMode ? '127.0.0.1:3000' : 'vibestudy.ru',
  serverHost: localMode ? '127.0.0.1' : 'mc.vibestudy.ru',
  shopPath: '/shop',
  minecraftVersionLabel: '1.21.1 Forge',
  // Discord Application ID for Rich Presence. Empty string disables the
  // integration entirely (no connection attempt is made).
  discordClientId: '',
});

export const BRAND_URLS = Object.freeze({
  authApi: `${BRAND.siteOrigin}/api/auth`,
  crashReport: `${BRAND.siteOrigin}/api/crash-report`,
  serverStatus: `${BRAND.siteOrigin}/api/server/status`,
  yggdrasil: `${BRAND.siteOrigin}/api/yggdrasil`,
  shop: `${BRAND.siteOrigin}${BRAND.shopPath}`,
});
