/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // ssh2 ships a native .node binary (used by lib/mc-bridge.ts). Keep it external
  // so webpack doesn't try to bundle the binary and fail the build.
  experimental: {
    serverComponentsExternalPackages: ['ssh2'],
  },
  async headers() {
    // Next.js dev (HMR / React Refresh) evaluates strings as JS and opens a
    // websocket, so dev needs 'unsafe-eval' and ws: in the CSP. Production keeps
    // the strict policy.
    const isDev = process.env.NODE_ENV !== 'production'
    const scriptSrc = `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`
    const connectSrc = `connect-src 'self'${isDev ? ' ws: http: https:' : ''}`
    const csp = `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; ${scriptSrc}; ${connectSrc}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: csp },
        ],
      },
    ]
  },
}

export default nextConfig
