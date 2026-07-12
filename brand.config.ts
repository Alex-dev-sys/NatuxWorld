/**
 * Single build-time source of truth for the launcher brand and its public API.
 * Change these values before producing a branded build for another server.
 */
export const BRAND = Object.freeze({
  name: 'NATUX WORLD',
  siteOrigin: 'https://vibestudy.ru',
  siteDomain: 'vibestudy.ru',
  serverHost: 'mc.vibestudy.ru',
  shopPath: '/shop',
  minecraftVersionLabel: '1.21.1 Forge',
});

export const BRAND_URLS = Object.freeze({
  authApi: `${BRAND.siteOrigin}/api/auth`,
  crashReport: `${BRAND.siteOrigin}/api/crash-report`,
  serverStatus: `${BRAND.siteOrigin}/api/server/status`,
  yggdrasil: `${BRAND.siteOrigin}/api/yggdrasil`,
  shop: `${BRAND.siteOrigin}${BRAND.shopPath}`,
});
