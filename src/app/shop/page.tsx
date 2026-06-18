import { getActiveProducts } from '@/lib/productStore'
import ShopClient from '@/components/ShopClient'

export const metadata = {
  title: 'Магазин — NATUX WORLD',
  description: 'Купить привилегии для Minecraft-сервера NATUX WORLD',
}

export const dynamic = 'force-dynamic'

export default async function ShopPage() {
  const activeProducts = await getActiveProducts()
  return <ShopClient products={activeProducts} />
}
