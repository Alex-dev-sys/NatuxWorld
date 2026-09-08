export interface Stats {
  users: { total: number; verified: number }
  orders: { total: number; today: number; revenue: number }
  sessions: { active: number }
  logins: { today: number; failsToday: number }
  crashes: { today: number; total: number }
}
export interface AdminUser {
  id: string; username: string; email: string
  emailVerified: boolean; tokenVersion: number
  bannedAt: string | null; banReason: string | null
  createdAt: string
  orders: number; lastLogin: { at: string; ip: string } | null
}
export interface GameEventRow {
  id: string; username: string; kind: string; message: string
  world: string; x: number | null; y: number | null; z: number | null
  extra: string; createdAt: string
}
export interface UserDetail extends Omit<AdminUser, 'orders' | 'lastLogin'> {
  orders: OrderSummary[]
  logins: LoginEventRow[]
  tokens: { accessToken: string; hasServerId: boolean; createdAt: string }[]
  gameEvents: GameEventRow[]
  ipHistory: { ip: string; count: number; lastSeen: string | null }[]
}
export interface OrderSummary {
  id: string; publicId: string; productName: string; variantDurationLabel: string
  price: number; status: string; createdAt: string; deliveredAt: string | null; couponCode: string | null
}
export interface LoginEventRow {
  id: string; kind: string; ip: string; userAgent: string; createdAt: string
}
export interface LoginEvent {
  id: string; userId: string | null; username: string | null
  ip: string; userAgent: string; kind: string; createdAt: string
}
export interface GameToken {
  accessToken: string; hasServerId: boolean; createdAt: string
  user: { id: string; username: string; email: string } | null
}
export interface CrashReport {
  id: string; kind: string; stage: string; message: string
  exitCode: number | null; version: string; platform: string; arch: string; createdAt: string
  logs?: string[]
}
export interface Order {
  id: string; publicId: string; productName: string; variantDurationLabel: string
  username: string; price: number; originalPrice?: number
  status: string; couponCode?: string; createdAt: string
}
export interface Coupon {
  code: string; type: string; value: number; description: string
  maxUses: number | null; usedCount: number; expiresAt: string | null; active: boolean
}
export interface LiveEvent {
  type: 'login_event' | 'order' | 'crash' | 'ping' | 'connected'
  data?: Record<string, unknown>
}
export interface AuditRow {
  id: string; action: string; target: string | null
  params: Record<string, unknown>; ip: string; ok: boolean; createdAt: string
}
export interface OnlineRoster { online: number; max: number; players: string[] }
