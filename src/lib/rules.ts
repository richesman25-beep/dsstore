import type { Catalog, CheckoutInput, Order, OrderStatus, OrderUpdate, Product } from '../types'

export const money = (amount: number) => `${new Intl.NumberFormat('fr-HT', { maximumFractionDigits: 2 }).format(amount)} G`
export const productPrice = (p: Product) => p.promotion_price !== null && p.promotion_price > 0 && p.promotion_price < p.price ? p.promotion_price : p.price
export const normalizePhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 8 ? `+509${digits}` : `+${digits}`
}
export const validPhone = (phone: string) => /^\+509[234]\d{7}$/.test(normalizePhone(phone))
export const cents = (n: number) => Math.round(n * 100)
export function validateCheckout(input: CheckoutInput, catalog: Catalog) {
  if (input.customer_name.trim().length < 2 || input.customer_name.trim().length > 100) throw new Error('Indiquez votre nom complet. / Ekri non konplè ou.')
  if (!validPhone(input.phone)) throw new Error('Numéro haïtien invalide : +509 et 8 chiffres. / Nimewo a pa valab.')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotency_key)) throw new Error('Session invalide. Réessayez. / Eseye ankò.')
  if (!['delivery', 'pickup'].includes(input.fulfillment)) throw new Error('Choisissez la livraison ou le retrait.')
  if (!input.items.length || input.items.length > 100) throw new Error('Le panier est vide ou trop volumineux. / Panye a vid oswa twò gwo.')
  const seen = new Set<string>()
  let subtotalCents = 0
  for (const line of input.items) {
    if (seen.has(line.product_id)) throw new Error('Article en double. / Atik la parèt de fwa.')
    seen.add(line.product_id)
    const p = catalog.products.find(p => p.id === line.product_id && p.active)
    if (!p || !Number.isInteger(p.stock) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99 || line.quantity > p.stock) throw new Error('Stock insuffisant ou produit indisponible. / Pa gen ase nan stòk.')
    if (!Number.isFinite(p.price) || p.price <= 0) throw new Error('Prix invalide. / Pri a pa valab.')
    subtotalCents += cents(productPrice(p)) * line.quantity
  }
  let discountCents = 0
  if (input.promo_code.trim()) {
    const now = Date.now()
    const promotion = catalog.promotions.find(p => p.code.toUpperCase() === input.promo_code.trim().toUpperCase() && p.active && Date.parse(p.starts_at) <= now && Date.parse(p.ends_at) > now)
    if (!promotion || !Number.isFinite(promotion.discount_percent) || promotion.discount_percent <= 0 || promotion.discount_percent > 100) throw new Error('Code promotionnel invalide ou expiré. / Kòd pwomosyon an pa valab.')
    discountCents = Math.round(subtotalCents * promotion.discount_percent / 100)
  }
  let feeCents = 0
  if (input.fulfillment === 'delivery') {
    const zone = catalog.zones.find(z => z.id === input.zone_id && z.active)
    if (!zone || zone.commune !== input.commune) throw new Error('Cette zone n’est pas activée pour la livraison. / Zòn sa a poko aktive.')
    if (input.address.trim().length < 8 || input.address.length > 1000 || input.landmark.trim().length < 3 || input.landmark.length > 300) throw new Error('Précisez une adresse et un point de repère. / Bay adrès la ak yon pwen referans.')
    if (!Number.isFinite(zone.min_order) || zone.min_order < 0) throw new Error('Minimum de commande invalide.')
    if (subtotalCents - discountCents < cents(zone.min_order)) throw new Error(`Minimum pour cette zone : ${money(zone.min_order)}. / Minimòm pou zòn sa a.`)
    if (!Number.isFinite(zone.fee) || zone.fee < 0) throw new Error('Frais de livraison invalides.')
    feeCents = cents(zone.fee)
  } else if (!catalog.settings.pickup_enabled || catalog.settings.pickup_address.trim().length < 5 || !catalog.settings.pickup_hours.trim()) {
    throw new Error('Le retrait n’est pas encore configuré. / Ranmasaj la poko konfigire.')
  }
  const payment = catalog.payments.find(p => p.id === input.payment_method)
  if (!payment?.enabled || !payment.configured || !payment.validated) throw new Error('Ce moyen de paiement n’est pas activé et validé. / Mwayen peman sa a poko aktive.')
  if (payment.id === 'moncash' || payment.id === 'natcash') throw new Error('L’intégration électronique attend sa validation technique. / Peman elektwonik la poko valide.')
  if (payment.id === 'manual' && !payment.instructions.trim()) throw new Error('Les instructions de paiement manuel ne sont pas configurées.')
  return { subtotal: subtotalCents / 100, discount: discountCents / 100, delivery_fee: feeCents / 100, total: (subtotalCents - discountCents + feeCents) / 100 }
}
export const transitions: Record<OrderStatus, OrderStatus[]> = {
  received: ['awaiting_payment', 'payment_confirmed', 'preparing', 'cancelled'],
  awaiting_payment: ['payment_confirmed', 'cancelled'],
  payment_confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'out_for_delivery', 'cancelled'],
  ready_for_pickup: ['delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [], cancelled: [],
}
export function validateOrderUpdate(order: Order, update: OrderUpdate) {
  if (order.status !== update.status && !transitions[order.status]?.includes(update.status)) throw new Error('Transition de statut non autorisée. / Chanjman estati sa a pa otorize.')
  if (!Number.isFinite(update.delivery_fee) || update.delivery_fee < 0 || (order.fulfillment === 'pickup' && update.delivery_fee !== 0)) throw new Error('Frais invalides. / Frè yo pa valab.')
  if (!['pending', 'confirmed', 'refunded'].includes(update.payment_status)) throw new Error('Statut de paiement invalide.')
  if (['delivered', 'cancelled'].includes(order.status)) throw new Error('Cette commande est clôturée.')
  if (order.payment_status === 'confirmed' && update.payment_status === 'pending') throw new Error('Un paiement confirmé ne peut pas redevenir en attente.')
  if (update.payment_status === 'refunded' && (update.status !== 'cancelled' || order.payment_status !== 'confirmed')) throw new Error('Enregistrez le remboursement lors de l’annulation d’une commande payée.')
  if (update.status === 'cancelled' && order.payment_status === 'confirmed' && update.payment_status !== 'refunded') throw new Error('Vérifiez et enregistrez le remboursement avant d’annuler cette commande payée.')
  if (order.payment_method === 'manual' && update.payment_status === 'confirmed' && update.payment_reference.trim().length < 3) throw new Error('Indiquez la référence du paiement vérifié.')
  if (order.fulfillment === 'pickup' && update.assigned_driver_id) throw new Error('Un retrait ne nécessite pas de livreur.')
  if (update.status === 'payment_confirmed' && update.payment_status !== 'confirmed') throw new Error('Confirmez le paiement avant ce statut.')
  if (order.payment_method !== 'cod' && ['preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered'].includes(update.status) && update.payment_status !== 'confirmed') throw new Error('Le paiement doit être confirmé avant la préparation.')
  if (update.status === 'ready_for_pickup' && order.fulfillment !== 'pickup') throw new Error('Cette commande est à livrer.')
  if (update.status === 'out_for_delivery' && (order.fulfillment !== 'delivery' || !update.assigned_driver_id)) throw new Error('Affectez un livreur à cette livraison.')
  if (update.status === 'delivered' && (!update.proof_note.trim() || (order.fulfillment === 'delivery' && !update.assigned_driver_id))) throw new Error('La preuve de remise et le livreur sont obligatoires. / Prèv remiz la obligatwa.')
  if (update.status === 'delivered' && update.payment_status !== 'confirmed') throw new Error('Confirmez le paiement à la remise.')
}
export const statusLabel = (status: OrderStatus, lang: 'fr' | 'ht') => ({
  received: ['Commande reçue', 'Kòmand resevwa'], awaiting_payment: ['En attente de paiement', 'Ap tann peman'], payment_confirmed: ['Paiement confirmé', 'Peman konfime'], preparing: ['En préparation', 'Y ap prepare l'], ready_for_pickup: ['Prête pour retrait', 'Pare pou ranmase'], out_for_delivery: ['En livraison', 'Y ap livre l'], delivered: ['Livrée', 'Livre'], cancelled: ['Annulée', 'Anile'],
}[status]?.[lang === 'fr' ? 0 : 1] ?? status)
export const whatsappUrl = (phone: string, message: string) => validPhone(phone) ? `https://wa.me/${normalizePhone(phone).slice(1)}?text=${encodeURIComponent(message)}` : null
