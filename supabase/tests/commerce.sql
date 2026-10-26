-- Run on an isolated Supabase database AFTER migrations, with the postgres role:
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/commerce.sql
-- The transaction rolls every fixture and operation back.
begin;

do $$ begin
  assert not exists(select 1 from public.delivery_zones where active), 'Initial zones must all be inactive';
  assert not exists(select 1 from public.payment_methods where enabled), 'Initial payments must all be disabled';
  assert jsonb_array_length(public.get_catalog()->'zones') = 0, 'Do not advertise unactivated coverage';
  assert not exists(select 1 from jsonb_array_elements(public.get_catalog()->'payments') p where (p->>'enabled')::boolean), 'Public metadata must not advertise enabled payments';
end $$;

insert into auth.users(id,email) values ('00000000-0000-4000-8000-000000000001','dsstore-admin-test@example.invalid');
insert into public.admin_users(user_id) values ('00000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$ declare v_category uuid; v_product jsonb; begin
  assert public.is_admin(), 'Provisioned admin must be recognized';
  select id into v_category from public.categories limit 1;
  v_product := public.admin_save_product(jsonb_build_object(
    'id','00000000-0000-4000-8000-000000000002','slug','commerce-test','name_fr','Produit test','name_ht','Pwodui tès',
    'category_id',v_category,'image_url','','price',100,'cost_price',40,'stock',5,'active',true,'featured',false,'is_new',false
  ));
  assert (v_product->>'cost_price')::numeric = 40, 'Cost must be saved transactionally';
end $$;
insert into public.delivery_zones(id,department,commune,name,active,fee,estimated_time,min_order,conditions)
values('00000000-0000-4000-8000-000000000003','Sud','Les Cayes','Zone de test',true,25,'24–48 heures',50,'Adresse et repère obligatoires');
insert into public.drivers(id,name,phone) values('00000000-0000-4000-8000-000000000004','Livreur test','+50937123456');
update public.payment_methods set configured=true,validated=true,enabled=true where id='cod';
insert into public.promotions(id,code,title_fr,title_ht,discount_percent,active,starts_at,ends_at)
values('00000000-0000-4000-8000-000000000005','TEST10','Dix pour cent','Dis pousan',10,true,now()-interval '1 day',now()+interval '1 day');

do $$ begin
  begin
    update public.payment_methods set enabled=true,configured=true,validated=true where id='moncash';
    raise exception 'TEST: electronic payment gate was bypassed';
  exception when check_violation then null; end;
  begin
    update public.products set stock=999 where id='00000000-0000-4000-8000-000000000002';
    raise exception 'TEST: direct product writes were allowed';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims','{"role":"anon"}',true);

do $$ declare v_payload jsonb; v_receipt jsonb; v_again jsonb; v_track jsonb; v_message text; begin
  assert not public.is_admin(), 'Anonymous users cannot be administrators';
  assert not exists(select 1 from jsonb_array_elements(public.get_catalog()->'products') p where p ? 'cost_price'), 'No purchase costs in public catalogue';
  begin
    perform 1 from public.orders;
    raise exception 'TEST: anonymous order table read allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.admin_users(user_id) values('00000000-0000-4000-8000-000000000099');
    raise exception 'TEST: admin self-promotion allowed';
  exception when insufficient_privilege then null; end;
  v_payload := jsonb_build_object(
    'idempotency_key','00000000-0000-4000-8000-000000000006','customer_name','Client test','phone','37 12 34 56',
    'zone_id','00000000-0000-4000-8000-000000000003','commune','Tampered commune','address','Rue du test, maison 12',
    'landmark','Près du marché','fulfillment','delivery','payment_method','cod','promo_code','TEST10',
    'items',jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000000002','quantity',2,'price',0.01))
  );
  v_receipt := public.place_order(v_payload);
  assert (v_receipt->>'total')::numeric=205, 'Server price (200), discount (20), delivery (25) must override client prices';
  assert length(v_receipt->>'tracking_token')=64, 'Tracking secret must have 256 bits';
  v_again := public.place_order(v_payload);
  assert v_again=v_receipt, 'Identical retries return same receipt without duplicate order';
  perform set_config('dsstore.test.receipt',v_receipt::text,true);
  begin
    perform public.place_order(jsonb_set(v_payload,'{customer_name}','"Another client"'));
    raise exception 'TEST: conflicting retry accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'IDEMPOTENCY_CONFLICT' then raise; end if;
  end;
  v_track := public.track_order(v_receipt->>'reference',v_receipt->>'tracking_token');
  assert not (v_track ?| array['customer_name','phone','address','landmark','tracking_hash','id','assigned_driver_id','proof_note','payment_reference']), 'Tracking must omit customer data and operational secrets';
  assert not ((v_track->'items'->0) ? 'unit_cost'), 'Tracking must omit costs';
  assert (v_track->>'total')::numeric=205, 'Tracking should return financial totals';
  begin
    perform public.track_order(v_receipt->>'reference',repeat('0',64));
    raise exception 'TEST: incorrect tracking secret accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'ORDER_NOT_FOUND' then raise; end if;
  end;
  begin
    perform public.place_order((v_payload-'items') || jsonb_build_object('idempotency_key',gen_random_uuid()));
    raise exception 'TEST: missing cart accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'INVALID_CART' then raise; end if;
  end;
  begin
    perform public.place_order(v_payload || jsonb_build_object('idempotency_key',gen_random_uuid(),'phone','+1 212 555 0101'));
    raise exception 'TEST: non-Haitian phone accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'INVALID_HAITIAN_PHONE' then raise; end if;
  end;
  begin
    perform public.place_order(v_payload || jsonb_build_object('idempotency_key',gen_random_uuid(),'zone_id',(select id from public.delivery_zones where false)));
    raise exception 'TEST: unactivated coverage accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'DELIVERY_ZONE_INACTIVE' then raise; end if;
  end;
  begin
    perform public.place_order(v_payload || jsonb_build_object('idempotency_key',gen_random_uuid(),'items',jsonb_build_array(jsonb_build_object('product_id','00000000-0000-4000-8000-000000000002','quantity',99))));
    raise exception 'TEST: overselling accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'INSUFFICIENT_STOCK' then raise; end if;
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$ declare v_order public.orders%rowtype; v_message text; begin
  select * into strict v_order from public.orders where reference=(current_setting('dsstore.test.receipt')::jsonb->>'reference');
  assert (select stock from public.products where id='00000000-0000-4000-8000-000000000002')=3, 'One reservation only after idempotent retry';
  assert v_order.commune='Les Cayes', 'Delivery commune must come from the configured zone';
  assert (select unit_cost from public.order_items where order_id=v_order.id)=40, 'Cost snapshot must be recorded at purchase';
  begin
    perform public.admin_update_order(v_order.id,'{"status":"delivered","payment_status":"confirmed","proof_note":"Client signé"}');
    raise exception 'TEST: skipped status sequence accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'INVALID_STATUS_TRANSITION' then raise; end if;
  end;
  perform public.admin_update_order(v_order.id,'{"status":"preparing"}');
  begin
    perform public.admin_update_order(v_order.id,'{"status":"out_for_delivery"}');
    raise exception 'TEST: dispatch without driver accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'DRIVER_REQUIRED' then raise; end if;
  end;
  perform public.admin_update_order(v_order.id,'{"status":"out_for_delivery","assigned_driver_id":"00000000-0000-4000-8000-000000000004"}');
  begin
    perform public.admin_update_order(v_order.id,'{"status":"delivered","payment_status":"confirmed"}');
    raise exception 'TEST: delivery without proof accepted';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'DELIVERY_PROOF_REQUIRED' then raise; end if;
  end;
  perform public.admin_update_order(v_order.id,'{"status":"cancelled","note":"Client indisponible"}');
  assert (select stock from public.products where id='00000000-0000-4000-8000-000000000002')=5, 'Cancellation restores stock';
  begin
    perform public.admin_update_order(v_order.id,'{"status":"cancelled"}');
    raise exception 'TEST: terminal order accepted another mutation';
  exception when others then
    get stacked diagnostics v_message=message_text;
    if v_message<>'ORDER_IS_FINAL' then raise; end if;
  end;
  assert (select stock from public.products where id='00000000-0000-4000-8000-000000000002')=5, 'Cancellation cannot restore stock twice';
  assert (select count(*) from public.order_events where order_id=v_order.id)=4, 'Every successful order operation is audited';
  begin
    delete from public.order_events where order_id=v_order.id;
    raise exception 'TEST: audit deletion allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- Ordinary authenticated customers must not gain administrator privileges.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000098',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000098","role":"authenticated"}',true);
do $$ begin
  assert not public.is_admin(), 'Normal authenticated customer is not admin';
  assert not exists(select 1 from public.orders), 'RLS hides all raw orders from ordinary customers';
  begin
    perform public.admin_get_data();
    raise exception 'TEST: admin RPC exposed to ordinary customer';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
