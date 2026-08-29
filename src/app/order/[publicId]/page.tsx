// src/app/order/[publicId]/page.tsx
import { notFound } from 'next/navigation'
import { getOrder, toPublicOrder } from '@/lib/store'
import OrderClient from '@/components/OrderClient'

export const dynamic = 'force-dynamic'

export default async function OrderPage({ params }: { params: { publicId: string } }) {
  const order = await getOrder(params.publicId)
  if (!order) notFound()
  return <OrderClient initialOrder={toPublicOrder(order)} />
}
