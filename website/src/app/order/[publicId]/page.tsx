// src/app/order/[publicId]/page.tsx
import { notFound } from 'next/navigation'
import { getOrder, toPublicOrder } from '@/lib/store'
import { isMockPaymentsEnabled } from '@/lib/paymentConfig'
import OrderClient from '@/components/OrderClient'

export const dynamic = 'force-dynamic'

export default async function OrderPage({ params }: { params: { publicId: string } }) {
  const order = await getOrder(params.publicId)
  if (!order) notFound()
  // The server decides whether mock payment exists; the page must not offer a
  // button that the production endpoint rejects.
  return <OrderClient initialOrder={toPublicOrder(order)} mockPayments={isMockPaymentsEnabled()} />
}
