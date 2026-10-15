/**
 * Shared build-time brand consumed by both the renderer and the Rust backend.
 */
import launcherBrand from './config/launcher-brand.json';

declare const __NATUX_LOCAL_MODE__: boolean;

const localMode = typeof __NATUX_LOCAL_MODE__ !== 'undefined' && __NATUX_LOCAL_MODE__;

function buildOrigin(raw: string, local: boolean): URL {
  const url = new URL(raw);
  const allowed = local
    ? url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port.length > 0
    : url.protocol === 'https:' && url.hostname.length > 0;
  const hasControl = [...raw].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code <= 159);
  });
  if (!allowed || raw.trim() !== raw || hasControl
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Launcher brand must use an HTTPS origin or an explicit local loopback origin');
  }
  return url;
}

const productionOrigin = buildOrigin(launcherBrand.siteOrigin, false);
const localOrigin = buildOrigin(launcherBrand.local.siteOrigin, true);
const siteOrigin = (localMode ? localOrigin : productionOrigin).origin;

export const BRAND = Object.freeze({
  name: launcherBrand.name,
  siteOrigin,
  siteDomain: new URL(siteOrigin).host,
  serverHost: localMode ? launcherBrand.local.serverHost : launcherBrand.serverHost,
  shopPath: launcherBrand.shopPath,
  minecraftVersionLabel: launcherBrand.minecraftVersionLabel,
  discordClientId: launcherBrand.discordClientId,
});

export const BRAND_URLS = Object.freeze({
  authApi: `${BRAND.siteOrigin}/api/auth`,
  crashReport: `${BRAND.siteOrigin}/api/crash-report`,
  serverStatus: `${BRAND.siteOrigin}/api/server/status`,
  yggdrasil: `${BRAND.siteOrigin}/api/yggdrasil`,
  shop: `${BRAND.siteOrigin}${BRAND.shopPath}`,
});
