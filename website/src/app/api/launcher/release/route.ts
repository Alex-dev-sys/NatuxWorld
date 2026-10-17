import { NextResponse } from 'next/server'
import { getLauncherRelease } from '@/lib/launcherRelease'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(await getLauncherRelease(), { headers: { 'Cache-Control': 'public, max-age=60' } })
}
