// src/app/pay/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getOrder } from '@/lib/store'
import PaymentClient from '@/components/PaymentClient'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Оплата' }

export default async function PayPage({ params }: { params: { id: string } }) {
  const order = await getOrder(params.id)
  if (!order) notFound()
  if (!['created', 'waiting_payment'].includes(order.status)) {
    redirect(`/order/${order.publicId}`)
  }
  return <PaymentClient order={order} />
}
