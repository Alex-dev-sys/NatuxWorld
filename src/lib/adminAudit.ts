import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'
import { clientIp } from '@/lib/clientIp'

interface AuditInput {
  target?: string
  params?: Record<string, unknown>
  ok: boolean
}

// Best-effort audit. Never throws into the caller — a logging failure must not
// break the action being logged.
export async function logAdminAction(
  req: NextRequest,
  action: string,
  input: AuditInput,
): Promise<void> {
  try {
    await prisma.adminAudit.create({
      data: {
        action,
        target: input.target ?? null,
        params: (input.params ?? {}) as object,
        ip: clientIp(req),
        ok: input.ok,
      },
    })
  } catch (err) {
    console.error('[adminAudit] failed to log', action, err)
  }
}
