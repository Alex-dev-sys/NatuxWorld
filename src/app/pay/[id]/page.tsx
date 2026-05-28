import { notFound } from 'next/navigation'
import { getOrder } from '@/lib/store'
import PaymentClient from '@/components/PaymentClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Оплата' }

export default async function PayPage({ params }: { params: { id: string } }) {
  const order = getOrder(params.id)
  if (!order) notFound()
  if (!['created', 'waiting_payment'].includes(order.status)) {
    // Already paid or terminal — send to order status page
    const { redirect } = await import('next/navigation')
    redirect(`/order/${order.publicId}`)
  }
  return <PaymentClient order={order} />
}
