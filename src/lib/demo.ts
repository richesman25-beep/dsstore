import type { AdminData, Product } from '../types'

const product = (id: string, name_fr: string, name_ht: string, category_id: string, price: number, stock: number, image: string, extra: Partial<Product> = {}): Product => ({
  id, slug: id, name_fr, name_ht, category_id, price, stock,
  image_url: `/images/${image}.webp`, active: true, featured: true, is_new: true,
  promotion_price: null, cost_price: Math.round(price * .65),
  description_fr: 'Article de démonstration pour découvrir la boutique. Les prix et les disponibilités sont illustratifs.',
  description_ht: 'Atik demonstrasyon pou dekouvri boutik la. Pri ak disponiblite yo se egzanp sèlman.',
  ...extra,
})

export function createDemoData(): AdminData {
  return {
    categories: [
      { id: 'electronics', slug: 'electronique', name_fr: 'Électronique', name_ht: 'Elektwonik' },
      { id: 'home', slug: 'maison', name_fr: 'Maison & cuisine', name_ht: 'Kay & kwizin' },
      { id: 'fashion', slug: 'mode', name_fr: 'Mode & accessoires', name_ht: 'Mòd & akseswa' },
      { id: 'groceries', slug: 'alimentation', name_fr: 'Alimentation', name_ht: 'Manje' },
      { id: 'beauty', slug: 'beaute', name_fr: 'Beauté & soins', name_ht: 'Bote & swen' },
    ],
    products: [
      product('demo-fan', 'Ventilateur rechargeable', 'Vantilatè rechajab', 'home', 4500, 12, 'fan', { promotion_price: 3950 }),
      product('demo-backpack', 'Sac à dos essentiel', 'Sakado esansyèl', 'fashion', 2250, 18, 'backpack'),
      product('demo-earbuds', 'Écouteurs sans fil', 'Ekoutè san fil', 'electronics', 2750, 15, 'earbuds', { promotion_price: 2250 }),
      product('demo-sneakers', 'Baskets du quotidien', 'Tenis pou chak jou', 'fashion', 3800, 9, 'sneakers', { is_new: false }),
      product('demo-rice', 'Riz de qualité · 5 kg', 'Bon diri · 5 kg', 'groceries', 1450, 32, 'rice', { is_new: false }),
      product('demo-skincare', 'Soin hydratant naturel', 'Swen idratan natirèl', 'beauty', 950, 20, 'skincare'),
      product('demo-kettle', 'Bouilloire électrique', 'Bouyi dlo elektrik', 'home', 2500, 8, 'kettle', { promotion_price: 2150, is_new: false }),
      product('demo-phone', 'Smartphone essentiel', 'Telefòn esansyèl', 'electronics', 12500, 11, 'phone'),
    ],
    zones: ['Les Cayes', 'Torbeck', 'Port-Salut', 'Camp-Perrin', 'Chantal', 'Maniche', 'Aquin', 'Saint-Louis-du-Sud', 'Cavaillon'].map((commune, i) => ({
      id: `demo-zone-${i + 1}`, department: 'Sud', commune, name: `${commune} — centre`,
      active: false, fee: 0, estimated_time: '', min_order: 0, conditions: '',
    })),
    payments: [
      { id: 'cod', label: 'Paiement à la livraison', enabled: false, configured: false, validated: false, instructions: '' },
      { id: 'manual', label: 'Paiement manuel vérifié', enabled: false, configured: false, validated: false, instructions: '' },
      { id: 'moncash', label: 'MonCash', enabled: false, configured: false, validated: false, instructions: '' },
      { id: 'natcash', label: 'NatCash', enabled: false, configured: false, validated: false, instructions: '' },
    ],
    settings: { name: 'DS STORE', whatsapp: '', pickup_address: '', pickup_hours: '', pickup_enabled: false },
    promotions: [{
      id: 'demo-promo', code: 'DEMO10', title_fr: '10 % pour découvrir DS STORE', title_ht: '10 % pou dekouvri DS STORE',
      discount_percent: 10, active: true, starts_at: '2025-01-01T00:00:00.000Z', ends_at: '2035-01-01T00:00:00.000Z',
    }],
    drivers: [], orders: [],
  }
}
