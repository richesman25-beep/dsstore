import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoData } from '../src/lib/demo'
import { cents, money, normalizePhone, productPrice, statusLabel, validateCheckout, validateOrderUpdate, validPhone, whatsappUrl } from '../src/lib/rules'
import type { Catalog, CheckoutInput, Order, OrderUpdate } from '../src/types'

function catalog(): Catalog {
  const data = createDemoData()
  data.zones[0] = { ...data.zones[0], active: true, fee: 250, estimated_time: '24 à 48 h' }
  data.settings = { ...data.settings, pickup_enabled: true, pickup_address: 'Rue du Centre, Les Cayes', pickup_hours: 'Lundi–samedi, 9 h–17 h' }
  data.payments = data.payments.map(payment => ({ ...payment, enabled: true, configured: true, validated: true, instructions: 'Référence à vérifier par l’administration.' }))
  return { ...data, demo: true }
}

function checkout(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customer_name: 'Marie Pierre', phone: '+509 3456 7890', zone_id: 'demo-zone-1', commune: 'Les Cayes',
    address: 'Rue du Centre, maison verte', landmark: 'À côté du marché', fulfillment: 'delivery', payment_method: 'cod',
    items: [{ product_id: 'demo-backpack', quantity: 2 }], promo_code: '', idempotency_key: '8c29abf9-9f7e-4d83-8678-cdf6a0aef093', ...overrides,
  }
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'demo-order', reference: 'DEMO-TEST', customer_name: 'Marie Pierre', phone: '+50934567890', commune: 'Les Cayes',
    address: 'Rue du Centre', landmark: 'Marché', fulfillment: 'delivery', payment_method: 'cod', payment_status: 'pending',
    status: 'received', subtotal: 4500, discount: 0, delivery_fee: 250, total: 4750, created_at: '2026-10-25T12:00:00Z',
    assigned_driver_id: null, proof_note: '', payment_reference: '', items: [], events: [], ...overrides,
  }
}

function update(overrides: Partial<OrderUpdate> = {}): OrderUpdate {
  return { status: 'preparing', assigned_driver_id: null, delivery_fee: 250, proof_note: '', payment_reference: '', payment_status: 'pending', note: '', ...overrides }
}

describe('Coordonnées et affichage local', () => {
  it.each(['34567890', '24567890', '44567890', '+509 3456 7890', '50934567890', '(509) 3456-7890'])('accepte et normalise le numéro haïtien %s', phone => {
    expect(validPhone(phone)).toBe(true)
    expect(normalizePhone(phone)).toMatch(/^\+509[234]\d{7}$/)
  })

  it.each(['', '14567890', '54567890', '3456789', '345678901', '+1 202 555 0123', '+509 3456 78901'])('refuse le numéro non haïtien ou incomplet %s', phone => {
    expect(validPhone(phone)).toBe(false)
  })

  it('encode le message WhatsApp et ne crée aucun lien pour un contact absent', () => {
    expect(whatsappUrl('+509 3456 7890', 'Bonjou & merci !')).toBe('https://wa.me/50934567890?text=Bonjou%20%26%20merci%20!')
    expect(whatsappUrl('', 'Bonjour')).toBeNull()
    expect(whatsappUrl('12345', 'Bonjour')).toBeNull()
  })

  it('affiche les gourdes avec le séparateur français et conserve les centimes', () => {
    expect(money(1234.5).replace(/\s/g, ' ')).toBe('1 234,5 G')
    expect(cents(49.99)).toBe(4999)
    expect(money(0)).toBe('0 G')
  })

  it('traduit les statuts de retrait et de livraison dans les deux langues', () => {
    expect(statusLabel('ready_for_pickup', 'fr')).toBe('Prête pour retrait')
    expect(statusLabel('ready_for_pickup', 'ht')).toBe('Pare pou ranmase')
    expect(statusLabel('delivered', 'fr')).toBe('Livrée')
    expect(statusLabel('cancelled', 'ht')).toBe('Anile')
  })
})

describe('Prix du catalogue', () => {
  const product = createDemoData().products[0]

  it('utilise la promotion produit seulement lorsqu’elle réduit un prix positif', () => {
    expect(productPrice({ ...product, price: 100, promotion_price: 75 })).toBe(75)
    expect(productPrice({ ...product, price: 100, promotion_price: null })).toBe(100)
  })

  it.each([0, -5, 100, 150, Number.NaN])('ignore une remise produit incorrecte (%s)', promotion_price => {
    expect(productPrice({ ...product, price: 100, promotion_price })).toBe(100)
  })
})

describe('Validation de la commande et calculs autoritaires', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z')) })
  afterEach(() => { vi.useRealTimers() })

  it('calcule le sous-total à partir du catalogue et ajoute les frais activés', () => {
    expect(validateCheckout(checkout(), catalog())).toEqual({ subtotal: 4500, discount: 0, delivery_fee: 250, total: 4750 })
  })

  it('combine les promotions produit et le code valide sans erreur de centimes', () => {
    const data = catalog()
    data.products[0] = { ...data.products[0], price: 40, promotion_price: 19.99 }
    data.zones[0].fee = 5.25
    const result = validateCheckout(checkout({ items: [{ product_id: data.products[0].id, quantity: 3 }], promo_code: ' demo10 ' }), data)
    expect(result).toEqual({ subtotal: 59.97, discount: 6, delivery_fee: 5.25, total: 59.22 })
  })

  it('refuse un nom vide, trop court ou trop long', () => {
    for (const customer_name of ['', ' ', 'M', 'M'.repeat(101)]) expect(() => validateCheckout(checkout({ customer_name }), catalog())).toThrow(/nom complet/)
  })

  it('refuse un téléphone étranger avant de créer une commande', () => {
    expect(() => validateCheckout(checkout({ phone: '+1 202 555 0123' }), catalog())).toThrow(/haïtien invalide/)
  })

  it('refuse une clé de session qui n’est pas un UUID', () => {
    for (const idempotency_key of ['', 'not-a-uuid', '-'.repeat(36)]) expect(() => validateCheckout(checkout({ idempotency_key }), catalog())).toThrow(/Session invalide/)
  })

  it('refuse un panier vide ou excessif', () => {
    expect(() => validateCheckout(checkout({ items: [] }), catalog())).toThrow(/panier est vide/)
    expect(() => validateCheckout(checkout({ items: Array.from({ length: 101 }, () => ({ product_id: 'demo-backpack', quantity: 1 })) }), catalog())).toThrow(/volumineux/)
  })

  it('refuse les lignes en double pour empêcher le contournement du stock', () => {
    expect(() => validateCheckout(checkout({ items: [{ product_id: 'demo-backpack', quantity: 10 }, { product_id: 'demo-backpack', quantity: 10 }] }), catalog())).toThrow(/double/)
  })

  it.each([0, -1, 1.5, 19, 100, Number.NaN, Number.POSITIVE_INFINITY])('refuse une quantité incorrecte ou supérieure au stock (%s)', quantity => {
    expect(() => validateCheckout(checkout({ items: [{ product_id: 'demo-backpack', quantity }] }), catalog())).toThrow(/Stock insuffisant/)
  })

  it('refuse un produit désactivé ou absent', () => {
    const data = catalog()
    data.products.find(p => p.id === 'demo-backpack')!.active = false
    expect(() => validateCheckout(checkout(), data)).toThrow(/indisponible/)
    expect(() => validateCheckout(checkout({ items: [{ product_id: 'inconnu', quantity: 1 }] }), catalog())).toThrow(/indisponible/)
  })

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('refuse un prix catalogue invalide (%s)', price => {
    const data = catalog()
    const p = data.products.find(p => p.id === 'demo-backpack')!
    p.price = price
    expect(() => validateCheckout(checkout(), data)).toThrow(/Prix invalide/)
  })

  it('n’autorise que les zones actives correspondant à la commune choisie', () => {
    const data = catalog()
    data.zones[0].active = false
    expect(() => validateCheckout(checkout(), data)).toThrow(/zone n’est pas activée/)
    expect(() => validateCheckout(checkout({ commune: 'Torbeck' }), catalog())).toThrow(/zone n’est pas activée/)
    expect(() => validateCheckout(checkout({ zone_id: null }), catalog())).toThrow(/zone n’est pas activée/)
  })

  it('exige une adresse descriptive et un point de repère', () => {
    expect(() => validateCheckout(checkout({ address: 'rue' }), catalog())).toThrow(/adresse et un point de repère/)
    expect(() => validateCheckout(checkout({ landmark: '  ' }), catalog())).toThrow(/adresse et un point de repère/)
    expect(() => validateCheckout(checkout({ address: 'x'.repeat(1001) }), catalog())).toThrow(/adresse et un point de repère/)
  })

  it('applique le minimum de livraison après la réduction promotionnelle', () => {
    const data = catalog()
    data.zones[0].min_order = 4300
    expect(() => validateCheckout(checkout({ promo_code: 'DEMO10' }), data)).toThrow(/Minimum/)
    expect(validateCheckout(checkout(), data).total).toBe(4750)
  })

  it('refuse un minimum de livraison non fini', () => {
    const data = catalog()
    data.zones[0].min_order = Number.NaN
    expect(() => validateCheckout(checkout(), data)).toThrow()
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse des frais incorrects (%s)', fee => {
    const data = catalog()
    data.zones[0].fee = fee
    expect(() => validateCheckout(checkout(), data)).toThrow(/Frais de livraison invalides/)
  })

  it('ne facture aucun frais de livraison sur un retrait configuré', () => {
    expect(validateCheckout(checkout({ fulfillment: 'pickup', zone_id: null, address: '', landmark: '' }), catalog())).toEqual({ subtotal: 4500, discount: 0, delivery_fee: 0, total: 4500 })
  })

  it.each(['pickup_enabled', 'pickup_address', 'pickup_hours'] as const)('empêche le retrait lorsque %s manque', field => {
    const data = catalog()
    if (field === 'pickup_enabled') data.settings.pickup_enabled = false
    else data.settings[field] = ''
    expect(() => validateCheckout(checkout({ fulfillment: 'pickup' }), data)).toThrow(/retrait n’est pas encore configuré/)
  })

  it.each(['enabled', 'configured', 'validated'] as const)('refuse un paiement dont le champ %s est faux', field => {
    const data = catalog()
    data.payments.find(p => p.id === 'cod')![field] = false
    expect(() => validateCheckout(checkout(), data)).toThrow(/paiement n’est pas activé et validé/)
  })

  it.each(['moncash', 'natcash'] as const)('bloque %s même si des drapeaux côté client sont activés', payment_method => {
    expect(() => validateCheckout(checkout({ payment_method }), catalog())).toThrow(/validation technique/)
  })

  it('exige des instructions pour le paiement manuel et l’accepte une fois configuré', () => {
    const data = catalog()
    data.payments.find(p => p.id === 'manual')!.instructions = '  '
    expect(() => validateCheckout(checkout({ payment_method: 'manual' }), data)).toThrow(/instructions de paiement manuel/)
    expect(validateCheckout(checkout({ payment_method: 'manual' }), catalog()).total).toBe(4750)
  })

  it('rejette un code absent, désactivé, expiré ou pas encore valide', () => {
    expect(() => validateCheckout(checkout({ promo_code: 'INCONNU' }), catalog())).toThrow(/promotionnel invalide/)
    for (const change of [{ active: false }, { ends_at: '2026-10-25T12:00:00Z' }, { starts_at: '2026-10-26T00:00:00Z' }]) {
      const data = catalog()
      Object.assign(data.promotions[0], change)
      expect(() => validateCheckout(checkout({ promo_code: 'DEMO10' }), data)).toThrow(/promotionnel invalide/)
    }
  })

  it.each([0, -5, 101, Number.NaN, Number.POSITIVE_INFINITY])('refuse un pourcentage de code incorrect (%s)', discount_percent => {
    const data = catalog()
    data.promotions[0].discount_percent = discount_percent
    expect(() => validateCheckout(checkout({ promo_code: 'DEMO10' }), data)).toThrow(/promotionnel invalide/)
  })
})

describe('Opérations de commande et historique des statuts', () => {
  it('autorise la préparation d’un paiement à la livraison reçu', () => {
    expect(() => validateOrderUpdate(order(), update())).not.toThrow()
  })

  it('interdit un saut de statut et le retour en arrière', () => {
    expect(() => validateOrderUpdate(order(), update({ status: 'delivered' }))).toThrow(/Transition/)
    expect(() => validateOrderUpdate(order({ status: 'preparing' }), update({ status: 'received' }))).toThrow(/Transition/)
    expect(() => validateOrderUpdate(order({ status: 'awaiting_payment' }), update())).toThrow(/Transition/)
  })

  it('exige un paiement confirmé avant de préparer une commande prépayée', () => {
    expect(() => validateOrderUpdate(order({ payment_method: 'manual' }), update())).toThrow(/paiement doit être confirmé/)
    expect(() => validateOrderUpdate(order({ payment_method: 'manual' }), update({ payment_status: 'confirmed', payment_reference: 'MC-1234' }))).not.toThrow()
  })

  it('exige une référence vérifiée pour confirmer un paiement manuel', () => {
    expect(() => validateOrderUpdate(order({ payment_method: 'manual' }), update({ status: 'payment_confirmed', payment_status: 'confirmed', payment_reference: '  ' }))).toThrow(/référence/)
  })

  it('n’attribue le statut paiement confirmé qu’à un paiement réellement confirmé', () => {
    expect(() => validateOrderUpdate(order(), update({ status: 'payment_confirmed' }))).toThrow(/Confirmez le paiement/)
  })

  it('empêche un paiement confirmé de redevenir en attente', () => {
    expect(() => validateOrderUpdate(order({ payment_status: 'confirmed' }), update())).toThrow(/redevenir en attente/)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuse des frais modifiés non valides (%s)', delivery_fee => {
    expect(() => validateOrderUpdate(order(), update({ delivery_fee }))).toThrow(/Frais invalides/)
  })

  it('interdit un livreur et les frais de livraison pour une commande à retirer', () => {
    expect(() => validateOrderUpdate(order({ fulfillment: 'pickup', delivery_fee: 0 }), update({ delivery_fee: 50 }))).toThrow(/Frais invalides/)
    expect(() => validateOrderUpdate(order({ fulfillment: 'pickup', delivery_fee: 0 }), update({ delivery_fee: 0, assigned_driver_id: 'driver-1' }))).toThrow(/ne nécessite pas de livreur/)
  })

  it('réserve prête pour retrait au retrait et en livraison à une livraison avec livreur', () => {
    expect(() => validateOrderUpdate(order({ status: 'preparing' }), update({ status: 'ready_for_pickup' }))).toThrow(/à livrer/)
    expect(() => validateOrderUpdate(order({ status: 'preparing', fulfillment: 'pickup' }), update({ status: 'out_for_delivery', delivery_fee: 0 }))).toThrow(/livreur/)
    expect(() => validateOrderUpdate(order({ status: 'preparing' }), update({ status: 'out_for_delivery' }))).toThrow(/Affectez un livreur/)
    expect(() => validateOrderUpdate(order({ status: 'preparing' }), update({ status: 'out_for_delivery', assigned_driver_id: 'driver-1' }))).not.toThrow()
  })

  it('exige preuve, livreur et paiement confirmé avant la remise en livraison', () => {
    const current = order({ status: 'out_for_delivery', assigned_driver_id: 'driver-1' })
    const delivered = update({ status: 'delivered', assigned_driver_id: 'driver-1', payment_status: 'confirmed', proof_note: 'Remis à Marie à 14 h.' })
    expect(() => validateOrderUpdate(current, { ...delivered, proof_note: ' ' })).toThrow(/preuve de remise/)
    expect(() => validateOrderUpdate(current, { ...delivered, assigned_driver_id: null })).toThrow(/preuve de remise/)
    expect(() => validateOrderUpdate(current, { ...delivered, payment_status: 'pending' })).toThrow(/Confirmez le paiement à la remise/)
    expect(() => validateOrderUpdate(current, delivered)).not.toThrow()
  })

  it('autorise une remise en retrait sans livreur, avec preuve et paiement', () => {
    expect(() => validateOrderUpdate(order({ status: 'ready_for_pickup', fulfillment: 'pickup', delivery_fee: 0 }), update({ status: 'delivered', delivery_fee: 0, payment_status: 'confirmed', proof_note: 'Retrait signé par Marie.' }))).not.toThrow()
  })

  it.each(['delivered', 'cancelled'] as const)('empêche toute modification d’une commande clôturée (%s)', status => {
    expect(() => validateOrderUpdate(order({ status, payment_status: 'confirmed' }), update({ status, payment_status: 'confirmed' }))).toThrow(/clôturée/)
  })

  it('n’enregistre un remboursement que lors de l’annulation d’un paiement déjà confirmé', () => {
    expect(() => validateOrderUpdate(order(), update({ status: 'cancelled', payment_status: 'refunded' }))).toThrow(/remboursement/)
    expect(() => validateOrderUpdate(order({ payment_status: 'confirmed' }), update({ payment_status: 'refunded' }))).toThrow(/remboursement/)
    expect(() => validateOrderUpdate(order({ payment_status: 'confirmed' }), update({ status: 'cancelled', payment_status: 'refunded' }))).not.toThrow()
  })

  it('refuse un statut de paiement inconnu', () => {
    expect(() => validateOrderUpdate(order(), update({ payment_status: 'paid-ish' }))).toThrow(/Statut de paiement invalide/)
  })
})
