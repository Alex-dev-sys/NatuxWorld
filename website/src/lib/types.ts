export type Duration = '30d' | '90d' | 'forever'

export type OrderStatus =
  | 'created'
  | 'waiting_payment'
  | 'paid'
  | 'delivery_pending'
  | 'delivered'
  | 'delivery_failed'
  | 'cancelled'
  | 'refund_failed'
  | 'refunded'

export interface ProductVariant {
  duration: Duration
  durationLabel: string
  price: number
  commands: string[]
}

export interface Product {
  id: string
  slug: string
  name: string
  description: string
  perks: string[]
  variants: ProductVariant[]
  color: string
  order: number
  active: boolean
  badge?: string
  popular?: boolean
}

export interface Coupon {
  code: string
  type: 'percent' | 'fixed' | 'free'
  value: number
  description: string
  maxUses?: number
  usedCount?: number
  expiresAt?: string
  active?: boolean
}

export interface Order {
  id: string
  publicId: string
  productId: string
  productName: string
  variantDuration: Duration
  variantDurationLabel: string
  price: number
  username: string
  status: OrderStatus
  paymentId?: string
  paymentAsset?: 'TON' | 'USDT'
  paymentAmount?: string
  createdAt: string
  paidAt?: string
  deliveredAt?: string
  deliveryError?: string
  /** Immutable command templates captured when the order is created. */
  fulfillmentCommands?: string[]
  /** Commands actually executed, retained for customer/admin diagnostics. */
  rconCommands?: string[]
  couponCode?: string
  originalPrice?: number
}

/** Fields safe to expose on a public order status page. */
export type PublicOrder = Pick<Order,
  'publicId' | 'productName' | 'variantDuration' | 'variantDurationLabel' |
  'price' | 'username' | 'status' | 'createdAt' | 'paidAt' | 'deliveredAt' |
  'couponCode' | 'originalPrice'
> & { deliveryError?: never; rconCommands?: never[] }

export interface ServerStatus {
  online: boolean
  players: { online: number; max: number }
  version: string
  motd?: string
  tps?: number
}
