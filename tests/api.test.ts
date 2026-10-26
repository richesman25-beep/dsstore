import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CheckoutInput, Order, OrderUpdate } from '../src/types'
import { getAdminData, getCatalog, placeOrder, resetDemo, savePayment, saveProduct, saveSettings, saveZone, trackOrder, updateOrder } from '../src/lib/api'

vi.hoisted(() => {
  vi.stubEnv('VITE_SUPABASE_URL', '')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
})

beforeEach(() => resetDemo())

async function enableDemoDelivery(): Promise<CheckoutInput> {
  const data = await getAdminData()
  const zone = data.zones[0]
  await saveZone({ ...zone, active: true, fee: 250, estimated_time: '24 à 48 heures', conditions: 'Appel avant la remise en mains propres.' })
  await savePayment({ ...data.payments.find(p => p.id === 'cod')!, enabled: true, configured: true, validated: true, instructions: 'Régler en gourdes à la remise.' })
  return {
    customer_name: 'Client Démonstration', phone: '+509 34 12 56 78', zone_id: zone.id, commune: zone.commune,
    address: 'Rue de démonstration, maison bleue', landmark: 'En face du marché de test', fulfillment: 'delivery', payment_method: 'cod',
    items: [{ product_id: data.products[0].id, quantity: 2 }], promo_code: 'DEMO10', idempotency_key: crypto.randomUUID(),
  }
}
function change(order: Order, extra: Partial<OrderUpdate>): OrderUpdate {
  return { status: order.status, assigned_driver_id: order.assigned_driver_id, delivery_fee: order.delivery_fee,
    proof_note: order.proof_note, payment_reference: order.payment_reference, payment_status: order.payment_status, note: 'Opération de test', ...extra }
}

describe('sandbox clearly separated from a real store', () => {
  it('upgrades the old built-in photos without losing customized data or orders', async () => {
    const input = await enableDemoDelivery()
    const receipt = await placeOrder(input)
    const state = await getAdminData()
    state.products[0] = { ...state.products[0], image_url: '/images/fan.svg', price: 4800 }
    state.products[1].image_url = 'https://example.com/my-custom-bag.webp'
    state.settings.pickup_address = 'Mon adresse personnalisée'
    const receipts = { [input.idempotency_key]: { payload: JSON.stringify(input), receipt } }
    const local = new Map([['dsstore:demo:v1', JSON.stringify({ ...state, receipts })]])
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => local.get(key) ?? null,
      setItem: (key: string, value: string) => { local.set(key, value) },
    })
    try {
      vi.resetModules()
      const reloaded = await import('../src/lib/api')
      const upgraded = await reloaded.getAdminData()
      expect(upgraded.products[0].image_url).toBe('/images/fan.webp')
      expect(upgraded.products[0].price).toBe(4800)
      expect(upgraded.products[0].stock).toBe(state.products[0].stock)
      expect(upgraded.products[1].image_url).toBe('https://example.com/my-custom-bag.webp')
      expect(upgraded.orders).toEqual(state.orders)
      expect(upgraded.settings).toEqual(state.settings)
      expect(JSON.parse(local.get('dsstore:demo:v1')!).receipts).toEqual(receipts)
    } finally { vi.unstubAllGlobals() }
  })

  it('does not advertise delivery coverage or pickup before admin activation', async () => {
    const catalog = await getCatalog()
    expect(catalog.demo).toBe(true)
    expect(catalog.zones).toEqual([])
    expect(catalog.settings.pickup_enabled).toBe(false)
    expect(catalog.payments.filter(p => p.enabled)).toEqual([])
    expect((await getAdminData()).zones).toHaveLength(9)
  })

  it('reserves stock once, calculates the discount, and protects confidential tracking', async () => {
    const input = await enableDemoDelivery()
    const before = (await getAdminData()).products[0].stock
    const receipt = await placeOrder(input)
    expect(receipt.reference).toMatch(/^DEMO-/)
    expect(receipt.total).toBe(7360)
    expect(await placeOrder(input)).toEqual(receipt)
    expect((await getAdminData()).products[0].stock).toBe(before - 2)
    await expect(placeOrder({ ...input, items: [{ ...input.items[0], quantity: 1 }] })).rejects.toThrow()
    await expect(trackOrder(receipt.reference, 'incorrect-secret')).rejects.toThrow()
    const tracked = await trackOrder(receipt.reference, receipt.tracking_token)
    expect(tracked.status).toBe('received')
    expect(tracked.total).toBe(receipt.total)
    expect(tracked.customer_name).toBe('')
    expect(tracked.phone).toBe('')
    expect(tracked.address).toBe('')
    expect(tracked.tracking_token).toBeUndefined()
    expect(tracked.items[0]).not.toHaveProperty('unit_cost')
    expect(tracked.events.every(event => event.note === '')).toBe(true)
  })

  it('restores reserved stock on cancellation and leaves terminal orders immutable', async () => {
    const input = await enableDemoDelivery()
    const before = (await getAdminData()).products[0].stock
    const receipt = await placeOrder(input)
    const order = (await getAdminData()).orders.find(o => o.reference === receipt.reference)!
    await updateOrder(order.id, change(order, { status: 'cancelled' }))
    expect((await getAdminData()).products[0].stock).toBe(before)
    const cancelled = (await getAdminData()).orders.find(o => o.id === order.id)!
    expect(cancelled.events).toHaveLength(2)
    await expect(updateOrder(order.id, change(cancelled, { status: 'cancelled' }))).rejects.toThrow()
    expect((await getAdminData()).products[0].stock).toBe(before)
  })

  it('rejects inactive service and unconfigured payment despite a tampered checkout', async () => {
    const input = await enableDemoDelivery()
    const data = await getAdminData()
    await saveZone({ ...data.zones[0], active: false })
    await expect(placeOrder(input)).rejects.toThrow()
    await saveZone({ ...data.zones[0], active: true })
    const cod = data.payments.find(p => p.id === 'cod')!
    await savePayment({ ...cod, enabled: false })
    await expect(placeOrder(input)).rejects.toThrow()
    expect((await getAdminData()).orders).toHaveLength(0)
  })

  it('keeps electronic providers closed and hides product purchase costs', async () => {
    const data = await getAdminData()
    const moncash = data.payments.find(p => p.id === 'moncash')!
    await expect(savePayment({ ...moncash, enabled: true, configured: true, validated: true, instructions: 'Test' })).rejects.toThrow()
    const product = { ...data.products[0], cost_price: 1234, stock: 7 }
    await saveProduct(product)
    expect((await getAdminData()).products.find(p => p.id === product.id)?.cost_price).toBe(1234)
    expect((await getCatalog()).products.find(p => p.id === product.id)).not.toHaveProperty('cost_price')
    expect((await getCatalog()).payments.find(p => p.id === 'moncash')?.enabled).toBe(false)
  })

  it('makes store contact and pickup details editable, then supports a zero-fee pickup', async () => {
    const input = await enableDemoDelivery()
    const settings = (await getAdminData()).settings
    await saveSettings({ ...settings, whatsapp: '+509 34 12 56 78', pickup_address: 'Adresse fictive de retrait aux Cayes', pickup_hours: 'Lundi au vendredi, 9 h à 16 h', pickup_enabled: true })
    expect((await getCatalog()).settings.whatsapp).toBe('50934125678')
    const receipt = await placeOrder({ ...input, fulfillment: 'pickup', zone_id: null, address: '', landmark: '', promo_code: '', idempotency_key: crypto.randomUUID() })
    const order = (await getAdminData()).orders.find(o => o.reference === receipt.reference)!
    expect(order.delivery_fee).toBe(0)
    expect(order.total).toBe(order.subtotal)
  })
})
