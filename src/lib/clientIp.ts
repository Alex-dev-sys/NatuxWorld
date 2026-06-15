// Single source of truth for the real client IP. nginx must be configured to
// OVERWRITE X-Forwarded-For (not append a client-supplied value) — see plan Phase 1 Step 5.
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}
