// src/lib/db.ts
// Prisma 7 requires a driver adapter instead of a URL in the schema.
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  return new PrismaClient({ adapter })
}

export const prisma = global.__prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}
