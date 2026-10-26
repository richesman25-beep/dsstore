import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { AdminData, Catalog, CheckoutInput, Driver, Order, OrderReceipt, OrderUpdate, PaymentMethod, Product, Promotion, Settings, Zone } from '../types'
import { createDemoData } from './demo'
import { validateCheckout, validateOrderUpdate } from './rules'

const url = import.meta.env.VITE_SUPABASE_URL?.trim() || ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || ''
export const isConfigured = Boolean(url && anonKey && /^https?:\/\//.test(url))
const client: SupabaseClient | null = isConfigured ? createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null

const DEMO_KEY = 'dsstore:demo:v1'
type DemoState = AdminData & { receipts: Record<string, { payload: string; receipt: OrderReceipt }> }
let memoryState: DemoState | null = null
function freshDemo(): DemoState { return { ...createDemoData(), receipts: {} } }
function clone<T>(value: T): T { return structuredClone(value) }
function upgradeDemoImages(state: DemoState): DemoState {
  const builtIns = new Map(createDemoData().products.map(product => [product.id, product.image_url]))
  let changed = false
  state.products = state.products.map(product => {
    const currentImage = builtIns.get(product.id)
    if (currentImage && product.image_url === currentImage.replace(/\.webp$/, '.svg')) {
      changed = true
      return { ...product, image_url: currentImage }
    }
    return product
  })
  // Update built-in visuals without resetting an existing demonstration's edits,
  // settings, reserved stock, orders or private tracking receipts.
  if (changed) {
    try { if (typeof localStorage !== 'undefined') localStorage.setItem(DEMO_KEY, JSON.stringify(state)) } catch { /* Keep the upgraded state in session memory. */ }
  }
  return state
}
function readDemo(): DemoState {
  if (memoryState) return clone(memoryState)
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(DEMO_KEY) : null
    if (stored) {
      const parsed: unknown = JSON.parse(stored)
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as DemoState).products) && Array.isArray((parsed as DemoState).orders) && (parsed as DemoState).receipts) {
        memoryState = upgradeDemoImages(parsed as DemoState)
        return clone(memoryState)
      }
    }
  } catch { /* A blocked or invalid browser store starts a fresh, isolated sandbox. */ }
  memoryState = freshDemo()
  return clone(memoryState)
}
function writeDemo(data: DemoState): void {
  // A configured store must never persist a fallback order or administrative write.
  if (isConfigured) throw new Error('Le mode démonstration est indisponible sur une boutique connectée.')
  memoryState = clone(data)
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(DEMO_KEY, JSON.stringify(data)) } catch { /* Session memory remains usable if browser persistence is blocked. */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('dsstore:catalog'))
}
export function resetDemo(): void {
  if (isConfigured) throw new Error('La réinitialisation ne concerne que la démonstration.')
  writeDemo(freshDemo())
}
function db(): SupabaseClient {
  if (!client) throw new Error('Supabase doit être configuré pour utiliser la boutique réelle.')
  return client
}
const serverMessages: Record<string, string> = {
  INVALID_CUSTOMER_NAME: 'Indiquez votre nom complet. / Ekri non konplè ou.',
  INVALID_HAITIAN_PHONE: 'Numéro haïtien invalide : +509 suivi de 8 chiffres. / Nimewo ayisyen an pa valab.',
  DELIVERY_ZONE_INACTIVE: 'Cette zone n’est pas activée pour la livraison. / Zòn sa a poko aktive pou livrezon.',
  DELIVERY_ADDRESS_REQUIRED: 'Précisez l’adresse et un point de repère. / Bay adrès la ak yon pwen referans.',
  PICKUP_UNAVAILABLE: 'Le retrait n’est pas encore disponible. / Ranmasaj la poko disponib.',
  PAYMENT_METHOD_UNAVAILABLE: 'Ce moyen de paiement n’est pas disponible. / Mwayen peman sa a pa disponib.',
  PRODUCT_UNAVAILABLE: 'Un produit de votre panier n’est plus disponible. / Yon atik nan panye a pa disponib ankò.',
  INSUFFICIENT_STOCK: 'Le stock a changé. Vérifiez votre panier. / Stòk la chanje. Verifye panye ou.',
  INVALID_CART: 'Le panier est vide ou invalide. / Panye a vid oswa li pa valab.',
  DUPLICATE_CART_ITEM: 'Le panier contient un article en double. / Gen yon atik ki parèt de fwa nan panye a.',
  INVALID_QUANTITY: 'La quantité demandée est invalide. / Kantite ou mande a pa valab.',
  PROMOTION_INVALID: 'Le code promotionnel est invalide ou expiré. / Kòd pwomosyon an pa valab oswa li ekspire.',
  DELIVERY_MINIMUM_NOT_MET: 'Le minimum de commande pour cette zone n’est pas atteint. / Kòmand lan poko rive nan minimòm pou zòn sa a.',
  IDEMPOTENCY_CONFLICT: 'Cette tentative correspond déjà à un autre panier. Recommencez la validation. / Rekòmanse validasyon panye a.',
  ORDER_NOT_FOUND: 'Commande introuvable. Vérifiez la référence et le code confidentiel. / Kòmand lan pa jwenn. Verifye referans ak kòd sekrè a.',
  ORDER_IS_FINAL: 'Cette commande est clôturée et ne peut plus être modifiée. / Kòmand sa a fini, li pa ka chanje ankò.',
  INVALID_STATUS_TRANSITION: 'Ce changement de statut n’est pas autorisé. / Chanjman estati sa a pa otorize.',
  DELIVERY_PROOF_REQUIRED: 'Une preuve de remise descriptive est obligatoire. / Yon prèv remiz nesesè.',
  PAYMENT_CONFIRMATION_REQUIRED: 'Le paiement doit être confirmé avant cette opération. / Peman an dwe konfime anvan operasyon sa a.',
  PAYMENT_REFERENCE_REQUIRED: 'Renseignez la référence vérifiée du paiement manuel. / Antre referans peman manyèl ou verifye a.',
  DRIVER_REQUIRED: 'Affectez un livreur à cette commande. / Chwazi yon livre pou kòmand sa a.',
  DRIVER_UNAVAILABLE: 'Ce livreur est inactif ou indisponible. / Livre sa a pa disponib.',
  PAYMENT_CANNOT_BE_UNCONFIRMED: 'Un paiement confirmé ne peut pas revenir en attente. / Yon peman konfime pa ka tounen an atant.',
  INVALID_REFUND: 'Le remboursement concerne uniquement une commande payée en cours d’annulation. / Ranbousman an mande yon kòmand ki te peye epi k ap anile.',
  INVALID_PAYMENT_STATUS: 'Le statut du paiement est invalide. / Estati peman an pa valab.',
  INVALID_DELIVERY_FEE: 'Les frais de livraison sont invalides. / Frè livrezon yo pa valab.',
  PICKUP_HAS_NO_DRIVER: 'Une commande à retirer ne peut pas être affectée à un livreur. / Yon kòmand pou ranmase pa bezwen livre.',
  INVALID_PICKUP_STATUS: 'Cette commande doit être livrée. / Kòmand sa a dwe livre.',
  ADMIN_REQUIRED: 'Un compte administrateur autorisé est nécessaire. / Yon kont administratè otorize nesesè.',
}
function throwError(error: { message?: string; code?: string } | null): void {
  if (!error) return
  if (error.message && serverMessages[error.message]) throw new Error(serverMessages[error.message])
  if (error.code === '42501' || error.code === 'PGRST301') throw new Error('Accès refusé. Connectez-vous avec un compte administrateur autorisé.')
  if (error.code === '42P01' || error.code === 'PGRST202') throw new Error('La base DS STORE n’est pas initialisée. Appliquez les migrations Supabase du projet.')
  if (error.code === '23505') throw new Error('Ce code ou identifiant existe déjà. Choisissez-en un autre. / Kòd oswa idantifyan sa a egziste deja.')
  if (error.code?.startsWith('23') || error.code === '22P02') throw new Error('Certaines données ne sont pas valides. Vérifiez les champs et la configuration. / Verifye enfòmasyon yo ak konfigirasyon an.')
  if (error.message === 'Invalid login credentials') throw new Error('Adresse e-mail ou mot de passe incorrect. / Imèl oswa modpas la pa kòrèk.')
  throw new Error(error.message || 'La demande a échoué. Vérifiez la connexion puis réessayez.')
}
async function rpc<T>(name: string, args?: Record<string, unknown>, allowEmpty = false): Promise<T> {
  const { data, error } = await db().rpc(name, args)
  throwError(error)
  if (data == null && !allowEmpty) throw new Error('Réponse vide du serveur. Réessayez après vérification de la configuration.')
  return data as T
}
function catalogFromDemo(state: DemoState): Catalog {
  const now = Date.now()
  return {
    products: state.products.filter(p => p.active).map(({ cost_price: _cost, ...p }) => p),
    categories: state.categories, zones: state.zones.filter(z => z.active), payments: state.payments,
    settings: state.settings,
    promotions: state.promotions.filter(p => p.active && Date.parse(p.starts_at) <= now && Date.parse(p.ends_at) > now),
    demo: true,
  }
}
export async function getCatalog(): Promise<Catalog> {
  if (!isConfigured) return catalogFromDemo(readDemo())
  const data = await rpc<Omit<Catalog, 'demo'>>('get_catalog')
  return { ...data, demo: false }
}
export async function getIsAdmin(): Promise<boolean> {
  if (!client) return false
  const { data: { session }, error } = await client.auth.getSession()
  throwError(error)
  if (!session) return false
  const { data, error: roleError } = await client.rpc('is_admin')
  throwError(roleError)
  return data === true
}
export function subscribeAuth(callback: (isAdmin: boolean) => void): () => void {
  let active = true
  let timer: ReturnType<typeof setTimeout> | undefined
  const check = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { void getIsAdmin().then(value => { if (active) callback(value) }).catch(() => { if (active) callback(false) }) }, 0)
  }
  check()
  if (!client) return () => { active = false; if (timer) clearTimeout(timer) }
  const { data: { subscription } } = client.auth.onAuthStateChange(check)
  return () => { active = false; if (timer) clearTimeout(timer); subscription.unsubscribe() }
}
export async function login(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email: email.trim(), password })
  throwError(error)
  if (!await getIsAdmin()) {
    await db().auth.signOut()
    throw new Error('Ce compte ne dispose pas des droits administrateur DS STORE.')
  }
}
export async function logout(): Promise<void> {
  if (!client) return
  const { error } = await client.auth.signOut()
  throwError(error)
}
export async function getAdminData(): Promise<AdminData> {
  if (!isConfigured) {
    const { receipts: _receipts, ...data } = readDemo()
    return data
  }
  return rpc<AdminData>('admin_get_data')
}
async function adminUpsert(table: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await db().from(table).upsert(payload)
  throwError(error)
}
function rowId(id: string): Record<string, string> { return id ? { id } : {} }
function saveDemoRow<T extends { id: string }>(rows: T[], row: T): T[] {
  const next = { ...row, id: row.id || crypto.randomUUID() }
  return rows.some(item => item.id === next.id) ? rows.map(item => item.id === next.id ? next : item) : [...rows, next]
}
function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} doit être un nombre positif ou nul.`)
}
export async function saveProduct(product: Product): Promise<void> {
  if (!product.name_fr.trim() || !product.name_ht.trim() || !product.category_id) throw new Error('Les noms français et créole et la catégorie sont obligatoires.')
  assertFinite(product.price, 'Le prix'); assertFinite(product.stock, 'Le stock')
  if (product.price === 0) throw new Error('Le prix doit être supérieur à zéro.')
  if (!Number.isInteger(product.stock)) throw new Error('Le stock doit être un nombre entier.')
  if (product.cost_price != null) assertFinite(product.cost_price, 'Le prix de revient')
  if (product.promotion_price != null && (!Number.isFinite(product.promotion_price) || product.promotion_price <= 0 || product.promotion_price >= product.price)) throw new Error('Le prix promotionnel doit être positif et inférieur au prix normal.')
  if (product.image_url && !/^(https:\/\/|\/images\/)/.test(product.image_url)) throw new Error('Utilisez une URL d’image HTTPS ou un chemin /images/.')
  if (!isConfigured) { const state = readDemo(); state.products = saveDemoRow(state.products, product); writeDemo(state); return }
  await rpc('admin_save_product', { p_payload: product })
}
export async function saveZone(zone: Zone): Promise<void> {
  if (!zone.department.trim() || !zone.commune.trim() || !zone.name.trim()) throw new Error('Le département, la commune et le nom de zone sont obligatoires.')
  assertFinite(zone.fee, 'Les frais de livraison'); assertFinite(zone.min_order, 'Le minimum de commande')
  if (zone.active && (!zone.estimated_time.trim() || !zone.conditions.trim())) throw new Error('Indiquez le délai et les conditions avant d’activer la zone.')
  if (!isConfigured) { const state = readDemo(); state.zones = saveDemoRow(state.zones, zone); writeDemo(state); return }
  await adminUpsert('delivery_zones', { ...rowId(zone.id), department: zone.department, commune: zone.commune, name: zone.name, active: zone.active, fee: zone.fee, estimated_time: zone.estimated_time, min_order: zone.min_order, conditions: zone.conditions })
}
export async function saveSettings(settings: Settings): Promise<void> {
  if (!settings.name.trim()) throw new Error('Le nom de la boutique est obligatoire.')
  const whatsapp = settings.whatsapp.replace(/[\s()+.-]/g, '')
  if (whatsapp && !/^509[234]\d{7}$/.test(whatsapp)) throw new Error('Le numéro WhatsApp doit être un numéro haïtien au format +509 suivi de 8 chiffres.')
  if (settings.pickup_enabled && (settings.pickup_address.trim().length < 5 || !settings.pickup_hours.trim())) throw new Error('Renseignez une adresse descriptive et les horaires avant d’activer le retrait.')
  const next = { ...settings, whatsapp }
  if (!isConfigured) { const state = readDemo(); state.settings = next; writeDemo(state); return }
  await adminUpsert('settings', { id: true, ...next })
}
export async function savePayment(method: PaymentMethod): Promise<void> {
  if ((method.id === 'moncash' || method.id === 'natcash') && (method.enabled || method.configured || method.validated)) throw new Error('Ce paiement électronique nécessite une intégration serveur et une validation technique. Il reste désactivé.')
  if (method.enabled && !method.instructions.trim()) throw new Error('Indiquez les instructions avant d’activer ce paiement.')
  if (method.enabled && (!method.configured || !method.validated)) throw new Error('Configurez et validez la procédure de paiement avant de l’activer.')
  if (!isConfigured) { const state = readDemo(); state.payments = saveDemoRow(state.payments, method); writeDemo(state); return }
  await adminUpsert('payment_methods', { id: method.id, label: method.label, enabled: method.enabled, configured: method.configured, validated: method.validated, instructions: method.instructions })
}
export async function savePromotion(promotion: Promotion): Promise<void> {
  const code = promotion.code.trim().toUpperCase()
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) throw new Error('Le code promotionnel doit contenir 3 à 24 lettres, chiffres ou tirets.')
  if (!promotion.title_fr.trim() || !promotion.title_ht.trim()) throw new Error('Renseignez le titre de la promotion dans les deux langues.')
  if (!Number.isFinite(promotion.discount_percent) || promotion.discount_percent <= 0 || promotion.discount_percent > 100) throw new Error('La remise doit être supérieure à 0 et inférieure ou égale à 100 %.')
  if (!Number.isFinite(Date.parse(promotion.starts_at)) || !Number.isFinite(Date.parse(promotion.ends_at)) || Date.parse(promotion.ends_at) <= Date.parse(promotion.starts_at)) throw new Error('La fin de promotion doit suivre sa date de début.')
  const next = { ...promotion, code }
  if (!isConfigured) {
    const state = readDemo()
    if (state.promotions.some(p => p.code === code && p.id !== promotion.id)) throw new Error('Ce code promotionnel existe déjà.')
    state.promotions = saveDemoRow(state.promotions, next); writeDemo(state); return
  }
  await adminUpsert('promotions', { ...rowId(promotion.id), code, title_fr: promotion.title_fr, title_ht: promotion.title_ht, discount_percent: promotion.discount_percent, active: promotion.active, starts_at: promotion.starts_at, ends_at: promotion.ends_at })
}
export async function saveDriver(driver: Driver): Promise<void> {
  if (driver.name.trim().length < 2) throw new Error('Le nom du livreur doit contenir au moins deux caractères.')
  const localPhone = driver.phone.replace(/[\s()+.-]/g, '').replace(/^509/, '')
  if (!/^[234]\d{7}$/.test(localPhone)) throw new Error('Le téléphone du livreur doit être un numéro haïtien valide.')
  const next = { ...driver, phone: `+509${localPhone}` }
  if (!isConfigured) { const state = readDemo(); state.drivers = saveDemoRow(state.drivers, next); writeDemo(state); return }
  await adminUpsert('drivers', { ...rowId(driver.id), name: next.name, phone: next.phone, active: next.active })
}
export async function placeOrder(input: CheckoutInput): Promise<OrderReceipt> {
  if (isConfigured) return rpc<OrderReceipt>('place_order', { p_payload: input })
  const state = readDemo()
  const payload = JSON.stringify(input)
  const existing = state.receipts[input.idempotency_key]
  if (existing) {
    if (existing.payload !== payload) throw new Error('Cette tentative de commande a déjà été utilisée avec un autre panier. Recommencez la validation.')
    return existing.receipt
  }
  const totals = validateCheckout(input, catalogFromDemo(state))
  const orderId = crypto.randomUUID()
  const token = crypto.randomUUID() + crypto.randomUUID()
  const reference = `DEMO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${orderId.slice(0, 6).toUpperCase()}`
  const receipt = { reference, tracking_token: token, total: totals.total }
  const order: Order = {
    id: orderId, reference, customer_name: input.customer_name.trim(), phone: input.phone,
    commune: input.commune, address: input.address.trim(), landmark: input.landmark.trim(),
    fulfillment: input.fulfillment, payment_method: input.payment_method, payment_status: 'pending',
    status: 'received', ...totals,
    created_at: new Date().toISOString(), tracking_token: token, assigned_driver_id: null,
    proof_note: '', payment_reference: '',
    items: input.items.map(line => {
      const product = state.products.find(p => p.id === line.product_id)!
      product.stock -= line.quantity
      return { product_id: product.id, name: product.name_fr, quantity: line.quantity, unit_price: product.promotion_price ?? product.price, unit_cost: product.cost_price ?? 0 }
    }),
    events: [],
  }
  order.events = [{ id: crypto.randomUUID(), status: order.status, note: 'Commande de démonstration enregistrée localement.', created_at: order.created_at }]
  state.orders.unshift(order)
  state.receipts[input.idempotency_key] = { payload, receipt }
  writeDemo(state)
  return receipt
}
function publicOrder(order: Partial<Order>): Order {
  return {
    id: '', customer_name: '', phone: '', commune: '', address: '', landmark: '',
    payment_method: 'cod', payment_status: 'pending', assigned_driver_id: null, proof_note: '', payment_reference: '',
    reference: '', status: 'received', subtotal: 0, discount: 0, delivery_fee: 0, total: 0,
    fulfillment: 'delivery', created_at: '', items: [], events: [], ...order,
  }
}
export async function trackOrder(reference: string, token: string): Promise<Order> {
  if (!reference.trim() || !token.trim()) throw new Error('La référence et le code confidentiel de suivi sont obligatoires.')
  if (isConfigured) return publicOrder(await rpc<Partial<Order>>('track_order', { p_reference: reference.trim(), p_token: token.trim() }))
  const order = readDemo().orders.find(item => item.reference === reference.trim() && item.tracking_token === token.trim())
  if (!order) throw new Error('Commande introuvable. Vérifiez la référence et le code confidentiel de suivi.')
  return publicOrder({
    reference: order.reference, status: order.status, payment_status: order.payment_status,
    subtotal: order.subtotal, discount: order.discount, delivery_fee: order.delivery_fee, total: order.total,
    fulfillment: order.fulfillment, payment_method: order.payment_method, created_at: order.created_at,
    items: order.items.map(({ unit_cost: _unitCost, ...line }) => line),
    events: order.events.map(event => ({ ...event, note: '' })),
  })
}
export async function updateOrder(id: string, update: OrderUpdate): Promise<void> {
  if (isConfigured) { await rpc('admin_update_order', { p_order_id: id, p_payload: update }, true); return }
  const state = readDemo()
  const order = state.orders.find(item => item.id === id)
  if (!order) throw new Error('Commande introuvable.')
  if (update.status === 'payment_confirmed') update = { ...update, payment_status: 'confirmed' }
  validateOrderUpdate(order, update)
  if (update.assigned_driver_id && !state.drivers.some(driver => driver.id === update.assigned_driver_id && driver.active)) throw new Error('Le livreur choisi est introuvable ou inactif.')
  if (update.status === 'cancelled' && order.status !== 'cancelled') {
    for (const line of order.items) {
      const product = state.products.find(p => p.id === line.product_id)
      if (product) product.stock += line.quantity
    }
  }
  Object.assign(order, {
    status: update.status, assigned_driver_id: update.assigned_driver_id,
    delivery_fee: update.delivery_fee, proof_note: update.proof_note.trim(),
    payment_reference: update.payment_reference.trim(), payment_status: update.payment_status,
    total: order.subtotal - order.discount + update.delivery_fee,
  })
  order.events.push({ id: crypto.randomUUID(), status: update.status, note: update.note.trim(), created_at: new Date().toISOString() })
  writeDemo(state)
}
