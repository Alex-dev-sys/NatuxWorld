// src/app/pay/[id]/page.tsx
import { notFound, redirect } from 'next/navigation'
import { getOrder } from '@/lib/store'
import PaymentClient from '@/components/PaymentClient'
import type { Metadata } from 'next'
import { isMockPaymentsEnabled } from '@/lib/paymentConfig'
import { toPublicOrder } from '@/lib/store'

export const metadata: Metadata = { title: 'Оплата' }

export default async function PayPage({ params }: { params: { id: string } }) {
  if (!isMockPaymentsEnabled()) notFound()

  const order = await getOrder(params.id)
  if (!order) notFound()
  if (!['created', 'waiting_payment'].includes(order.status)) {
    redirect(`/order/${order.publicId}`)
  }
  return (
    <>
      <div
        className="bg-[#0d0000] border border-site-accent text-site-accent text-center px-4 py-3 mx-auto mt-4 max-w-md rounded"
        style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}
        role="alert"
      >
        ТЕСТОВЫЙ РЕЖИМ — оплата не настоящая. Не вводите данные реальной карты.
      </div>
      <PaymentClient order={toPublicOrder(order)} />
    </>
  )
}
