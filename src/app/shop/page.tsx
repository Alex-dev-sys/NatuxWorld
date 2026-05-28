import { products } from '@/lib/products'
import ShopClient from '@/components/ShopClient'

export const metadata = {
  title: 'Магазин — NATUX WORLD',
  description: 'Купить привилегии для Minecraft-сервера NATUX WORLD',
}

export default function ShopPage() {
  const activeProducts = products.filter(p => p.active).sort((a, b) => a.order - b.order)
  return <ShopClient products={activeProducts} />
}
