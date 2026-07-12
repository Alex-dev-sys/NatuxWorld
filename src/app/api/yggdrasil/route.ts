import { getPublicKeyPem } from '@/lib/yggdrasil'
import { BRAND } from '@/lib/brand'

export const dynamic = 'force-dynamic'

export async function GET() {
  let signaturePublickey = ''
  try { signaturePublickey = getPublicKeyPem() } catch { /* key not configured */ }

  return Response.json({
    meta: {
      serverName: BRAND.name,
      implementationName: 'natux-yggdrasil',
      implementationVersion: '1.0.0',
      'feature.non_email_login': true,
    },
    skinDomains: [BRAND.siteDomain],
    signaturePublickey,
  })
}
