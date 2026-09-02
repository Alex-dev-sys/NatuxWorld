// One-off hygiene script: purge historical telemetry that may contain secrets.
//
//   node scripts/purge-telemetry.mjs [retentionDays]
//
// 1. Deletes ALL legacy 'command' telemetry rows — before the label-only fix
//    the plugin stored full command lines, which include passwords typed via
//    /login, /register, /changepassword. This data must not survive.
// 2. Deletes 'chat' rows and everything older than the retention window
//    (default 90 days).
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const days = Number(process.argv[2] ?? 90)
const cutoff = new Date(Date.now() - (Number.isFinite(days) ? days : 90) * 86_400_000)

try {
  const commands = await prisma.gameEvent.deleteMany({ where: { kind: 'command' } })
  const chats = await prisma.gameEvent.deleteMany({ where: { kind: 'chat', createdAt: { lt: cutoff } } })
  const stale = await prisma.gameEvent.deleteMany({ where: { createdAt: { lt: cutoff } } })
  console.log(`Purged: ${commands.count} command rows, ${chats.count} chat rows, ${stale.count} rows older than ${days}d`)
} finally {
  await prisma.$disconnect()
}
