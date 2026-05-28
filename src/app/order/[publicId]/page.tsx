import { notFound } from 'next/navigation'
import { getOrder } from '@/lib/store'
import OrderClient from '@/components/OrderClient'

export const dynamic = 'force-dynamic'

export default function OrderPage({ params }: { params: { publicId: string } }) {
  const order = getOrder(params.publicId)
  if (!order) notFound()
  return <OrderClient initialOrder={order} />
}
