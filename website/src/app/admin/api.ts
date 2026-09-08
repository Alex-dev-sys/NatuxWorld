
/**
 * Fetch JSON and fail loudly. A bare `.then(r => r.json())` stored 401/404 error
 * bodies as if they were the requested entity, and the render then crashed on
 * the fields that body does not have.
 */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const r = await fetch(input, init)
  let body: unknown = null
  try { body = await r.json() } catch { /* non-JSON error page */ }
  if (!r.ok) {
    if (r.status === 401) {
      // Session gone — send the admin back to the login screen.
      if (typeof window !== 'undefined') window.location.href = '/admin/login'
      throw new Error('Сессия истекла')
    }
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `Ошибка ${r.status}`
    throw new Error(message)
  }
  return body as T
}
