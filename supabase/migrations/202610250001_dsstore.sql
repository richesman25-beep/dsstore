-- DS STORE: single-vendor commerce. Apply through Supabase migrations as postgres.
-- No live catalogue, payment or delivery coverage is enabled by this migration.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_fr text not null check (length(name_fr) between 1 and 100),
  name_ht text not null check (length(name_ht) between 1 and 100)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_fr text not null check (length(name_fr) between 1 and 160),
  name_ht text not null check (length(name_ht) between 1 and 160),
  description_fr text not null default '' check (length(description_fr) <= 4000),
  description_ht text not null default '' check (length(description_ht) <= 4000),
  category_id uuid not null references public.categories(id),
  image_url text not null default '' check (length(image_url) <= 2000 and (image_url = '' or image_url ~ '^https://' or image_url ~ '^/images/[a-zA-Z0-9_./-]+$')),
  price numeric(14,2) not null check (price > 0 and price <= 1000000000),
  stock integer not null default 0 check (stock between 0 and 1000000000),
  active boolean not null default false,
  featured boolean not null default false,
  is_new boolean not null default false,
  promotion_price numeric(14,2) check (promotion_price > 0 and promotion_price < price),
  created_at timestamptz not null default now()
);
-- Purchase costs never appear in the public products table or public catalogue RPC.
create table public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0 and cost_price <= 1000000000)
);

create table public.delivery_zones (
  id uuid primary key default gen_random_uuid(),
  department text not null default 'Sud' check (length(department) between 1 and 100),
  commune text not null check (length(commune) between 1 and 100),
  name text not null check (length(name) between 1 and 160),
  active boolean not null default false,
  fee numeric(14,2) not null default 0 check (fee >= 0 and fee <= 1000000000),
  estimated_time text not null default '' check (length(estimated_time) <= 160),
  min_order numeric(14,2) not null default 0 check (min_order >= 0 and min_order <= 1000000000),
  conditions text not null default '' check (length(conditions) <= 2000),
  unique (department, commune, name),
  check (not active or (length(trim(estimated_time)) > 0 and length(trim(conditions)) > 0))
);

create table public.settings (
  id boolean primary key default true check (id),
  name text not null default 'DS STORE' check (length(name) between 1 and 100),
  whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^509[234][0-9]{7}$'),
  pickup_address text not null default '' check (length(pickup_address) <= 1000),
  pickup_hours text not null default '' check (length(pickup_hours) <= 300),
  pickup_enabled boolean not null default false,
  check (not pickup_enabled or (length(trim(pickup_address)) >= 5 and length(trim(pickup_hours)) > 0))
);

create table public.payment_methods (
  id text primary key check (id in ('cod', 'manual', 'moncash', 'natcash')),
  label text not null check (length(label) between 1 and 120),
  enabled boolean not null default false,
  configured boolean not null default false,
  validated boolean not null default false,
  instructions text not null default '' check (length(instructions) <= 2000),
  check (not enabled or (configured and validated)),
  check (id <> 'manual' or not enabled or length(trim(instructions)) > 0),
  -- A real server-side payment adapter, authenticated callbacks and reconciliation
  -- must be introduced by a reviewed migration before either provider can be enabled.
  constraint electronic_payments_require_server_adapter
    check (id not in ('moncash', 'natcash') or (not enabled and not configured and not validated))
);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  title_fr text not null check (length(title_fr) between 1 and 160),
  title_ht text not null check (length(title_ht) between 1 and 160),
  discount_percent numeric(5,2) not null check (discount_percent > 0 and discount_percent <= 100),
  active boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  check (ends_at > starts_at)
);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 160),
  phone text not null check (phone ~ '^\+?509[234][0-9]{7}$'),
  active boolean not null default true
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_name text not null,
  phone text not null,
  commune text not null,
  zone_id uuid references public.delivery_zones(id),
  address text not null default '',
  landmark text not null default '',
  fulfillment text not null check (fulfillment in ('delivery','pickup')),
  payment_method text not null references public.payment_methods(id),
  payment_status text not null default 'pending' check (payment_status in ('pending','confirmed','refunded')),
  status text not null default 'received' check (status in ('received','awaiting_payment','payment_confirmed','preparing','ready_for_pickup','out_for_delivery','delivered','cancelled')),
  subtotal numeric(14,2) not null check (subtotal >= 0),
  discount numeric(14,2) not null default 0 check (discount >= 0 and discount <= subtotal),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0 and delivery_fee <= 1000000000),
  total numeric(14,2) not null check (total = subtotal - discount + delivery_fee),
  promotion_code text not null default '',
  assigned_driver_id uuid references public.drivers(id),
  proof_note text not null default '',
  payment_reference text not null default '',
  tracking_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fulfillment <> 'pickup' or delivery_fee = 0)
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  product_id uuid not null references public.products(id),
  name text not null,
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(14,2) not null check (unit_price > 0),
  unit_cost numeric(14,2) not null check (unit_cost >= 0),
  unique (order_id, product_id)
);
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  status text not null,
  note text not null default '',
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- These tables have no client grants. They hold token derivation and idempotency state.
create table public.checkout_secrets (
  id boolean primary key default true check (id),
  token_secret bytea not null
);
insert into public.checkout_secrets (token_secret) values (extensions.gen_random_bytes(64));
create table public.checkout_keys (
  idempotency_key uuid primary key,
  payload_hash text not null,
  order_id uuid not null unique references public.orders(id),
  created_at timestamptz not null default now()
);

create index products_category_active on public.products(category_id) where active;
create index orders_created_at on public.orders(created_at desc);
create index orders_commune_status on public.orders(commune, status);
create index orders_driver on public.orders(assigned_driver_id) where assigned_driver_id is not null;
create index order_events_order on public.order_events(order_id, created_at);

-- Deny by default, including PostgreSQL PUBLIC and any Supabase default grants.
do $$ declare t text; begin
  foreach t in array array['admin_users','categories','products','product_costs','delivery_zones','settings','payment_methods','promotions','drivers','orders','order_items','order_events','checkout_secrets','checkout_keys'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select on public.admin_users to authenticated;
create policy admin_membership_read on public.admin_users for select to authenticated using (public.is_admin());
grant select on public.categories, public.products, public.delivery_zones, public.settings, public.payment_methods, public.promotions to anon, authenticated;
grant select on public.product_costs, public.drivers, public.orders, public.order_items, public.order_events to authenticated;
create policy categories_read on public.categories for select to anon, authenticated using (true);
create policy products_read on public.products for select to anon, authenticated using (active or public.is_admin());
create policy zones_read on public.delivery_zones for select to anon, authenticated using (active or public.is_admin());
create policy settings_read on public.settings for select to anon, authenticated using (true);
create policy payments_read on public.payment_methods for select to anon, authenticated using (enabled or public.is_admin());
create policy promotions_read on public.promotions for select to anon, authenticated using ((active and now() between starts_at and ends_at) or public.is_admin());
do $$ declare t text; begin
  foreach t in array array['product_costs','drivers','orders','order_items','order_events'] loop
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())', t);
  end loop;
  foreach t in array array['categories','delivery_zones','settings','payment_methods','promotions','drivers'] loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('create policy admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
-- No direct writes to products, stock, costs, orders, items or audit events:
-- authenticated administrators also go through the guarded transactional RPCs.

insert into public.categories (slug,name_fr,name_ht) values
 ('maison','Maison & quotidien','Kay & chak jou'),
 ('electronique','Électronique','Elektwonik'),
 ('beaute','Beauté & soins','Bote & swen'),
 ('mode','Mode & accessoires','Mòd & akseswa'),
 ('alimentation','Alimentation','Manje'),
 ('energie','Énergie & éclairage','Enèji & limyè');
insert into public.delivery_zones (department,commune,name) select 'Sud', c, 'Centre de ' || c
from unnest(array['Les Cayes','Torbeck','Port-Salut','Camp-Perrin','Chantal','Maniche','Aquin','Saint-Louis-du-Sud','Cavaillon']) c;
insert into public.settings (id) values (true);
insert into public.payment_methods (id,label) values
 ('cod','Paiement à la livraison ou au retrait'),
 ('manual','Paiement manuel vérifié'),
 ('moncash','MonCash'),
 ('natcash','NatCash');

create or replace function public.get_catalog() returns jsonb
language sql stable security definer set search_path = '' as $$
 select jsonb_build_object(
   'products', coalesce((select jsonb_agg(to_jsonb(p) - 'created_at' order by p.name_fr) from public.products p where p.active), '[]'::jsonb),
   'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.name_fr) from public.categories c), '[]'::jsonb),
   'zones', coalesce((select jsonb_agg(to_jsonb(z) order by z.commune,z.name) from public.delivery_zones z where z.active), '[]'::jsonb),
   'settings', (select to_jsonb(s) - 'id' from public.settings s where id),
   'payments', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.payment_methods m), '[]'::jsonb),
   'promotions', coalesce((select jsonb_agg(to_jsonb(p) order by p.ends_at) from public.promotions p where p.active and now() between p.starts_at and p.ends_at), '[]'::jsonb),
   'demo', false
 );
$$;

create or replace function public.place_order(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
 v_key uuid; v_hash text; v_token text; v_secret bytea; v_existing public.checkout_keys%rowtype;
 v_order public.orders%rowtype; v_zone public.delivery_zones%rowtype; v_payment public.payment_methods%rowtype;
 v_settings public.settings%rowtype; v_product public.products%rowtype; v_promo public.promotions%rowtype;
 v_item jsonb; v_qty integer; v_phone text; v_name text; v_fulfillment text; v_address text; v_landmark text;
 v_subtotal numeric(14,2) := 0; v_discount numeric(14,2) := 0; v_fee numeric(14,2) := 0;
 v_price numeric(14,2); v_cost numeric(14,2); v_lines jsonb := '[]'; v_code text; v_reference text;
begin
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'INVALID_REQUEST'; end if;
 if octet_length(p_payload::text) > 50000 then raise exception 'REQUEST_TOO_LARGE'; end if;
 v_key := (p_payload->>'idempotency_key')::uuid;
 if v_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;
 v_hash := encode(extensions.digest(p_payload::text,'sha256'),'hex');
 -- Serialize all retries for the same key. No repeated reservations or duplicate orders.
 perform pg_advisory_xact_lock(hashtextextended(v_key::text, 0));
 select * into v_existing from public.checkout_keys where idempotency_key = v_key;
 select token_secret into strict v_secret from public.checkout_secrets where id;
 v_token := encode(extensions.hmac(v_key::text, encode(v_secret,'hex'), 'sha256'),'hex');
 if v_existing.order_id is not null then
   if v_existing.payload_hash <> v_hash then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
   select * into strict v_order from public.orders where id = v_existing.order_id;
   return jsonb_build_object('reference',v_order.reference,'tracking_token',v_token,'total',v_order.total);
 end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'INVALID_CART'; end if;
 if jsonb_array_length(p_payload->'items') not between 1 and 100 then raise exception 'INVALID_CART'; end if;
 if (select count(*) <> count(distinct x->>'product_id') from jsonb_array_elements(p_payload->'items') x) then raise exception 'DUPLICATE_CART_ITEM'; end if;
 v_name := trim(coalesce(p_payload->>'customer_name',''));
 v_phone := regexp_replace(coalesce(p_payload->>'phone',''), '[^0-9]', '', 'g');
 if length(v_phone)=8 then v_phone := '509'||v_phone; end if;
 if length(v_name) not between 2 and 120 then raise exception 'INVALID_CUSTOMER_NAME'; end if;
 if v_phone !~ '^509[234][0-9]{7}$' then raise exception 'INVALID_HAITIAN_PHONE'; end if;
 v_fulfillment := p_payload->>'fulfillment';
 v_address := trim(coalesce(p_payload->>'address',''));
 v_landmark := trim(coalesce(p_payload->>'landmark',''));
 select * into v_settings from public.settings where id for share;
 if v_fulfillment = 'delivery' then
   select * into v_zone from public.delivery_zones where id = (p_payload->>'zone_id')::uuid for share;
   if not found or not v_zone.active then raise exception 'DELIVERY_ZONE_INACTIVE'; end if;
   if length(v_address) not between 5 and 500 or length(v_landmark) not between 3 and 300 then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;
   v_fee := v_zone.fee;
 elsif v_fulfillment = 'pickup' then
   if not v_settings.pickup_enabled or trim(v_settings.pickup_address) = '' or trim(v_settings.pickup_hours) = '' then raise exception 'PICKUP_UNAVAILABLE'; end if;
 else raise exception 'INVALID_FULFILLMENT'; end if;
 select * into v_payment from public.payment_methods where id = p_payload->>'payment_method' for share;
 if not found or not v_payment.enabled or not v_payment.configured or not v_payment.validated or v_payment.id in ('moncash','natcash') then raise exception 'PAYMENT_METHOD_UNAVAILABLE'; end if;
 -- Product rows are locked in UUID order to avoid concurrent checkout deadlocks.
 for v_item in select x from jsonb_array_elements(p_payload->'items') x order by x->>'product_id' loop
   v_qty := (v_item->>'quantity')::integer;
   if v_qty is null or v_qty not between 1 and 99 then raise exception 'INVALID_QUANTITY'; end if;
   select * into v_product from public.products where id = (v_item->>'product_id')::uuid for update;
   if not found or not v_product.active then raise exception 'PRODUCT_UNAVAILABLE'; end if;
   if v_product.stock < v_qty then raise exception 'INSUFFICIENT_STOCK'; end if;
   v_price := coalesce(v_product.promotion_price,v_product.price);
   select cost_price into v_cost from public.product_costs where product_id = v_product.id;
   v_cost := coalesce(v_cost,0);
   v_subtotal := v_subtotal + v_price * v_qty;
   v_lines := v_lines || jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name_fr,'quantity',v_qty,'unit_price',v_price,'unit_cost',v_cost));
   update public.products set stock = stock-v_qty where id = v_product.id;
 end loop;
 v_code := upper(trim(coalesce(p_payload->>'promo_code','')));
 if v_code <> '' then
   select * into v_promo from public.promotions where code = v_code and active and now() between starts_at and ends_at for share;
   if not found then raise exception 'PROMOTION_INVALID'; end if;
   v_discount := round(v_subtotal * v_promo.discount_percent / 100,2);
 end if;
 if v_fulfillment = 'delivery' and v_subtotal-v_discount < v_zone.min_order then raise exception 'DELIVERY_MINIMUM_NOT_MET'; end if;
 v_reference := 'DS-' || to_char(now() at time zone 'America/Port-au-Prince','YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
 insert into public.orders (reference,customer_name,phone,commune,zone_id,address,landmark,fulfillment,payment_method,status,subtotal,discount,delivery_fee,total,promotion_code,tracking_hash)
 values (v_reference,v_name,'+'||v_phone,case when v_fulfillment='delivery' then v_zone.commune else left(coalesce(p_payload->>'commune','Les Cayes'),100) end,
 case when v_fulfillment='delivery' then v_zone.id else null end,v_address,v_landmark,v_fulfillment,v_payment.id,'received',v_subtotal,v_discount,v_fee,v_subtotal-v_discount+v_fee,v_code,encode(extensions.digest(v_token,'sha256'),'hex')) returning * into v_order;
 insert into public.order_items (order_id,product_id,name,quantity,unit_price,unit_cost)
 select v_order.id,(x->>'product_id')::uuid,x->>'name',(x->>'quantity')::integer,(x->>'unit_price')::numeric,(x->>'unit_cost')::numeric from jsonb_array_elements(v_lines) x;
 insert into public.order_events (order_id,status,note) values (v_order.id,'received','Commande reçue');
 insert into public.checkout_keys (idempotency_key,payload_hash,order_id) values (v_key,v_hash,v_order.id);
 return jsonb_build_object('reference',v_reference,'tracking_token',v_token,'total',v_order.total);
end;
$$;

create or replace function public.track_order(p_reference text,p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_order public.orders%rowtype;
begin
 -- A reference alone is never sufficient to read an order. The 256-bit bearer
 -- token is generated server-side and stored only as SHA-256 in the order table.
 if length(coalesce(p_reference,'')) > 100 or coalesce(p_token,'') !~ '^[a-f0-9]{64}$' then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into v_order from public.orders where reference=upper(trim(p_reference)) and tracking_hash=encode(extensions.digest(p_token,'sha256'),'hex');
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 return jsonb_build_object(
   'reference',v_order.reference,'status',v_order.status,'payment_status',v_order.payment_status,
   'subtotal',v_order.subtotal,'discount',v_order.discount,'delivery_fee',v_order.delivery_fee,'total',v_order.total,
   'created_at',v_order.created_at,'fulfillment',v_order.fulfillment,'payment_method',v_order.payment_method,
   'items',coalesce((select jsonb_agg(jsonb_build_object('product_id',i.product_id,'name',i.name,'quantity',i.quantity,'unit_price',i.unit_price)) from public.order_items i where i.order_id=v_order.id),'[]'::jsonb),
   -- Internal delivery details, addresses, payment references and admin notes stay private.
   'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'status',e.status,'note','','created_at',e.created_at) order by e.created_at,e.id) from public.order_events e where e.order_id=v_order.id),'[]'::jsonb)
 );
end;
$$;

create or replace function public.admin_get_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 return jsonb_build_object(
 'products',coalesce((select jsonb_agg((to_jsonb(p)-'created_at') || jsonb_build_object('cost_price',coalesce(c.cost_price,0)) order by p.name_fr) from public.products p left join public.product_costs c on c.product_id=p.id),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(to_jsonb(c) order by c.name_fr) from public.categories c),'[]'::jsonb),
 'zones',coalesce((select jsonb_agg(to_jsonb(z) order by z.department,z.commune,z.name) from public.delivery_zones z),'[]'::jsonb),
 'settings',(select to_jsonb(s)-'id' from public.settings s where s.id),
 'payments',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.payment_methods m),'[]'::jsonb),
 'promotions',coalesce((select jsonb_agg(to_jsonb(p) order by p.ends_at desc) from public.promotions p),'[]'::jsonb),
 'drivers',coalesce((select jsonb_agg(to_jsonb(d) order by d.name) from public.drivers d),'[]'::jsonb),
 'orders',coalesce((select jsonb_agg((to_jsonb(o)-'tracking_hash'-'zone_id'-'updated_at'-'promotion_code') || jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(i)-'id'-'order_id') from public.order_items i where i.order_id=o.id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e)-'order_id'-'actor_id' order by e.created_at,e.id) from public.order_events e where e.order_id=o.id),'[]'::jsonb)
 ) order by o.created_at desc) from public.orders o),'[]'::jsonb)
 );
end;
$$;

create or replace function public.admin_save_product(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_product public.products%rowtype; v_cost numeric(14,2);
begin
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'INVALID_PRODUCT'; end if;
 v_id := coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
 v_cost := coalesce(nullif(p_payload->>'cost_price','')::numeric,0);
 insert into public.products(id,slug,name_fr,name_ht,description_fr,description_ht,category_id,image_url,price,stock,active,featured,is_new,promotion_price)
 values(v_id,p_payload->>'slug',p_payload->>'name_fr',p_payload->>'name_ht',coalesce(p_payload->>'description_fr',''),coalesce(p_payload->>'description_ht',''),
 (p_payload->>'category_id')::uuid,coalesce(p_payload->>'image_url',''),(p_payload->>'price')::numeric,coalesce((p_payload->>'stock')::integer,0),
 coalesce((p_payload->>'active')::boolean,false),coalesce((p_payload->>'featured')::boolean,false),coalesce((p_payload->>'is_new')::boolean,false),nullif(p_payload->>'promotion_price','')::numeric)
 on conflict(id) do update set slug=excluded.slug,name_fr=excluded.name_fr,name_ht=excluded.name_ht,description_fr=excluded.description_fr,description_ht=excluded.description_ht,
 category_id=excluded.category_id,image_url=excluded.image_url,price=excluded.price,stock=excluded.stock,active=excluded.active,featured=excluded.featured,is_new=excluded.is_new,promotion_price=excluded.promotion_price
 returning * into v_product;
 insert into public.product_costs(product_id,cost_price) values(v_id,v_cost) on conflict(product_id) do update set cost_price=excluded.cost_price;
 return (to_jsonb(v_product)-'created_at') || jsonb_build_object('cost_price',v_cost);
end;
$$;

create or replace function public.admin_update_order(p_order_id uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders%rowtype; v_status text; v_payment_status text; v_fee numeric(14,2); v_proof text; v_payment_reference text; v_driver uuid; v_note text; v_allowed boolean;
begin
 if not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if v_order.status in ('delivered','cancelled') then raise exception 'ORDER_IS_FINAL'; end if;
 v_status := coalesce(p_payload->>'status',v_order.status);
 v_payment_status := coalesce(p_payload->>'payment_status',v_order.payment_status);
 v_fee := coalesce((p_payload->>'delivery_fee')::numeric,v_order.delivery_fee);
 v_driver := case when p_payload ? 'assigned_driver_id' then nullif(p_payload->>'assigned_driver_id','')::uuid else v_order.assigned_driver_id end;
 v_proof := trim(coalesce(p_payload->>'proof_note',v_order.proof_note));
 v_payment_reference := trim(coalesce(p_payload->>'payment_reference',v_order.payment_reference));
 v_note := trim(coalesce(p_payload->>'note',''));
 if length(v_note)>2000 or length(v_proof)>2000 or length(v_payment_reference)>200 then raise exception 'NOTE_TOO_LONG'; end if;
 if v_fee < 0 or v_fee > 1000000000 or (v_order.fulfillment='pickup' and v_fee<>0) then raise exception 'INVALID_DELIVERY_FEE'; end if;
 if v_driver is not null and not exists(select 1 from public.drivers where id=v_driver and active) then raise exception 'DRIVER_UNAVAILABLE'; end if;
 if v_order.fulfillment='pickup' and v_driver is not null then raise exception 'PICKUP_HAS_NO_DRIVER'; end if;
 v_allowed := v_status=v_order.status or v_status='cancelled' or case v_order.status
   when 'received' then v_status in ('awaiting_payment','payment_confirmed','preparing')
   when 'awaiting_payment' then v_status='payment_confirmed'
   when 'payment_confirmed' then v_status='preparing'
   when 'preparing' then v_status in ('ready_for_pickup','out_for_delivery')
   when 'ready_for_pickup' then v_status='delivered'
   when 'out_for_delivery' then v_status='delivered'
   else false end;
 if not v_allowed then raise exception 'INVALID_STATUS_TRANSITION'; end if;
 if v_status='ready_for_pickup' and v_order.fulfillment<>'pickup' then raise exception 'INVALID_PICKUP_STATUS'; end if;
 if v_status='out_for_delivery' and (v_order.fulfillment<>'delivery' or v_driver is null) then raise exception 'DRIVER_REQUIRED'; end if;
 if v_status='delivered' and length(v_proof)<5 then raise exception 'DELIVERY_PROOF_REQUIRED'; end if;
 if v_payment_status not in ('pending','confirmed','refunded') then raise exception 'INVALID_PAYMENT_STATUS'; end if;
 if v_payment_status='refunded' and (v_status<>'cancelled' or v_order.payment_status<>'confirmed') then raise exception 'INVALID_REFUND'; end if;
 if v_order.payment_status='confirmed' and v_payment_status='pending' then raise exception 'PAYMENT_CANNOT_BE_UNCONFIRMED'; end if;
 if v_status='payment_confirmed' then v_payment_status:='confirmed'; end if;
 if v_payment_status='confirmed' and v_order.payment_method='manual' and length(v_payment_reference)<3 then raise exception 'PAYMENT_REFERENCE_REQUIRED'; end if;
 if v_status in ('preparing','ready_for_pickup','out_for_delivery','delivered') and v_order.payment_method<>'cod' and v_payment_status<>'confirmed' then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;
 if v_status='delivered' and v_payment_status<>'confirmed' then raise exception 'PAYMENT_CONFIRMATION_REQUIRED'; end if;
 if v_status='cancelled' then
   -- Restore each reserved unit exactly once while holding the order row lock.
   perform 1 from public.products p join public.order_items i on i.product_id=p.id where i.order_id=v_order.id order by p.id for update of p;
   update public.products p set stock=p.stock+i.quantity from public.order_items i where i.order_id=v_order.id and i.product_id=p.id;
 end if;
 update public.orders set status=v_status,payment_status=v_payment_status,delivery_fee=v_fee,total=subtotal-discount+v_fee,
 assigned_driver_id=v_driver,proof_note=v_proof,payment_reference=v_payment_reference,updated_at=now() where id=p_order_id returning * into v_order;
 insert into public.order_events(order_id,status,note,actor_id) values(p_order_id,v_status,
   case when v_note<>'' then v_note || ' — ' else '' end || 'Paiement: '||v_payment_status||'; livraison: '||v_fee::text||' HTG; livreur: '||coalesce(v_driver::text,'—')||case when v_proof<>'' then '; preuve: '||v_proof else '' end,auth.uid());
 return to_jsonb(v_order)-'tracking_hash';
end;
$$;

revoke all on function public.get_catalog() from public;
revoke all on function public.place_order(jsonb) from public;
revoke all on function public.track_order(text,text) from public;
revoke all on function public.admin_get_data() from public;
revoke all on function public.admin_save_product(jsonb) from public;
revoke all on function public.admin_update_order(uuid,jsonb) from public;
grant execute on function public.get_catalog(),public.place_order(jsonb),public.track_order(text,text) to anon,authenticated;
grant execute on function public.admin_get_data(),public.admin_save_product(jsonb),public.admin_update_order(uuid,jsonb) to authenticated;

comment on table public.admin_users is 'Provision only through SQL Editor/service-role migration after verifying the administrator identity. Never grant client INSERT.';
comment on table public.checkout_secrets is 'Private server-side token derivation key. Never export, grant to API roles, or rotate without migrating outstanding checkout receipts.';
comment on function public.place_order(jsonb) is 'Atomic stock reservation and server-side pricing. Expose behind rate limiting/CAPTCHA before unrestricted public launch.';
