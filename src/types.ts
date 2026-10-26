export type Lang = 'fr' | 'ht'
export type PaymentId = 'cod' | 'manual' | 'moncash' | 'natcash'
export type OrderStatus = 'received' | 'awaiting_payment' | 'payment_confirmed' | 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'delivered' | 'cancelled'
export interface Category { id: string; slug: string; name_fr: string; name_ht: string }
export interface Product { id: string; slug: string; name_fr: string; name_ht: string; description_fr: string; description_ht: string; category_id: string; image_url: string; price: number; stock: number; active: boolean; featured: boolean; is_new: boolean; promotion_price: number | null; cost_price?: number }
export interface Zone { id: string; department: string; commune: string; name: string; active: boolean; fee: number; estimated_time: string; min_order: number; conditions: string }
export interface PaymentMethod { id: PaymentId; label: string; enabled: boolean; configured: boolean; validated: boolean; instructions: string }
export interface Settings { name: string; whatsapp: string; pickup_address: string; pickup_hours: string; pickup_enabled: boolean }
export interface Promotion { id: string; code: string; title_fr: string; title_ht: string; discount_percent: number; active: boolean; starts_at: string; ends_at: string }
export interface Driver { id: string; name: string; phone: string; active: boolean }
export interface Catalog { products: Product[]; categories: Category[]; zones: Zone[]; payments: PaymentMethod[]; settings: Settings; promotions: Promotion[]; demo: boolean }
export interface CartItem { product_id: string; quantity: number }
export interface CheckoutInput { customer_name: string; phone: string; zone_id: string | null; commune: string; address: string; landmark: string; fulfillment: 'delivery' | 'pickup'; payment_method: PaymentId; items: CartItem[]; promo_code: string; idempotency_key: string }
export interface OrderLine { product_id: string; name: string; quantity: number; unit_price: number; unit_cost?: number }
export interface OrderEvent { id: string; status: OrderStatus; note: string; created_at: string }
export interface Order { id: string; reference: string; customer_name: string; phone: string; commune: string; address: string; landmark: string; fulfillment: 'delivery' | 'pickup'; payment_method: PaymentId; payment_status: string; status: OrderStatus; subtotal: number; discount: number; delivery_fee: number; total: number; created_at: string; tracking_token?: string; assigned_driver_id: string | null; proof_note: string; payment_reference: string; items: OrderLine[]; events: OrderEvent[] }
export interface OrderReceipt { reference: string; tracking_token: string; total: number }
export interface AdminData { products: Product[]; categories: Category[]; zones: Zone[]; payments: PaymentMethod[]; settings: Settings; promotions: Promotion[]; orders: Order[]; drivers: Driver[] }
export interface OrderUpdate { status: OrderStatus; assigned_driver_id: string | null; delivery_fee: number; proof_note: string; payment_reference: string; payment_status: string; note: string }
