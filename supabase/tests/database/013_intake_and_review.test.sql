-- Phases 4A and 4B: upload lifecycle, applying extraction results, drafts,
-- validation results, matching and the price gate.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

create function pg_temp.run(p_user uuid, p_sql text, p_aal text default 'aal1') returns text language plpgsql as $$
declare v text; v_session uuid;
begin
  if p_aal = 'aal2' then
    insert into auth.sessions (id, user_id, aal, created_at, updated_at) values (gen_random_uuid(), p_user, 'aal2', now(), now()) returning id into v_session;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'aal', p_aal, 'session_id', v_session)::text, true);
  execute 'set local role authenticated';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  return v;
end $$;

create function pg_temp.svc(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute 'set local role service_role';
  begin
    execute p_sql into v;
  exception when others then
    v := 'ERR:' || sqlstate || ':' || sqlerrm;
  end;
  execute 'reset role';
  return v;
end $$;

create temp table k (name text primary key, v text);
grant all on k to authenticated, service_role;

-- Upload lifecycle --------------------------------------------------------------
-- Jordan (a5…04) Processor; Sam (a5…06) Viewer.
insert into k select 'doc', pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select public.create_pending_document('00000000-0000-4000-a000-000000000001', 'po-1.pdf', 'application/pdf', 1200)::text$$);
select ok((select v from k where name = 'doc') ~ '^[0-9a-f-]{36}$', 'a Processor creates a pending document');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000006',
  $$select public.create_pending_document('00000000-0000-4000-a000-000000000001', 'x.pdf', 'application/pdf', 10)::text$$), '^ERR:42501', 'a Viewer cannot upload');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select public.create_pending_document('00000000-0000-4000-a000-000000000001', 'x.exe', 'application/x-msdownload', 10)::text$$), '^ERR:22023', 'only PDF, PNG and JPEG are accepted');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select public.create_pending_document('00000000-0000-4000-a000-000000000001', 'big.pdf', 'application/pdf', 30000000)::text$$), '^ERR:22023', 'files over 20 MB are refused');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.finalize_document(%L, '00000000-0000-4000-a500-000000000004', %L, 1200, 1, 'application/pdf', null)::text$$, (select v from k where name = 'doc'), repeat('a', 64))),
  '^ERR:42501', 'signed-in users cannot finalise (server only)');

insert into k select 'fin', pg_temp.svc(format($$select public.finalize_document(%L, '00000000-0000-4000-a500-000000000004', %L, 1200, 2, 'application/pdf', null)::text$$,
  (select v from k where name = 'doc'), repeat('a', 64)));
select matches((select v from k where name = 'fin')::jsonb ->> 'reference', '^IN-[0-9]{6}$', 'finalising creates an intake with the next reference');
select is((select status::text from public.inbound_orders where id = ((select v from k where name = 'fin')::jsonb ->> 'inbound_order_id')::uuid), 'extracting',
  'the intake is queued for extraction in the same transaction');
select is((select count(*)::int from public.extraction_runs where inbound_order_id = ((select v from k where name = 'fin')::jsonb ->> 'inbound_order_id')::uuid and status = 'queued'), 1,
  'one queued extraction run');
select is((select actor_user_id from public.audit_events where action = 'inbound_order.received' and entity_id = (select v from k where name = 'fin')::jsonb ->> 'inbound_order_id'),
  '00000000-0000-4000-a500-000000000004'::uuid, 'the receipt is attributed to the uploader');
select is(pg_temp.svc(format($$select (public.finalize_document(%L, '00000000-0000-4000-a500-000000000004', %L, 1200, 2, 'application/pdf', null) ->> 'already_finalized')$$,
  (select v from k where name = 'doc'), repeat('a', 64))), 'true', 'finalising again is idempotent');
select matches(pg_temp.svc(format($$select public.finalize_document(%L, '00000000-0000-4000-a500-000000000006', %L, 1200, 2, 'application/pdf', null)::text$$,
  (select v from k where name = 'doc'), repeat('a', 64))), '^ERR:P0002', 'only the uploader''s document can be finalised');

-- Applying the extraction result ------------------------------------------------
insert into k select 'claim', pg_temp.svc('select to_jsonb(c)::text from public.claim_extraction_job(60) c');
select is(pg_temp.svc(format($$select public.complete_extraction(%L, %L, %L)$$,
  (select v from k where name = 'claim')::jsonb ->> 'run_id', (select v from k where name = 'claim')::jsonb ->> 'claim_token',
  '{"schema": "extraction.v1", "status": "complete", "header": {"customer_po_number": {"raw": "PO-77", "value": "PO-77", "confidence": 0.91, "page": 1}, "po_date": {"raw": "04/05/2026", "value": "2026-04-05", "confidence": 0.6, "ambiguous": true}}, "lines": [{"line_no": 1, "customer_part_number": {"raw": "HP-221", "value": "HP-221", "confidence": 0.9}, "quantity": {"raw": "20", "value": "20", "confidence": 0.9}, "uom": {"raw": "BX", "value": "BX", "confidence": 0.9}, "unit_price": {"raw": "8.95", "value": "8.95", "confidence": 0.9}}]}')),
  'completed', 'the worker completes the run');
select is((select customer_po_number || '/' || (field_meta -> 'customer_po_number' ->> 'state') || '/' || (field_meta -> 'po_date' ->> 'ambiguous')
             from public.inbound_orders where id = ((select v from k where name = 'fin')::jsonb ->> 'inbound_order_id')::uuid),
  'PO-77/suggested/true', 'extracted values are applied as suggestions with provenance');
select is((select po_quantity::text || '/' || quantity::text || '/' || price_source || '/' || (field_meta -> 'quantity' ->> 'source')
             from public.inbound_order_lines where inbound_order_id = ((select v from k where name = 'fin')::jsonb ->> 'inbound_order_id')::uuid),
  '20.000/20.000/po_price/ai', 'lines keep the printed values and suggest the resolved ones');

-- A not-recognised document opens in manual entry.
insert into k select 'doc2', pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select public.create_pending_document('00000000-0000-4000-a000-000000000001', 'letter.pdf', 'application/pdf', 900)::text$$);
insert into k select 'fin2', pg_temp.svc(format($$select public.finalize_document(%L, '00000000-0000-4000-a500-000000000004', %L, 900, 1, 'application/pdf', null)::text$$,
  (select v from k where name = 'doc2'), repeat('b', 64)));
insert into k select 'claim2', pg_temp.svc('select to_jsonb(c)::text from public.claim_extraction_job(60) c');
select is(pg_temp.svc(format($$select public.complete_extraction(%L, %L, '{"schema": "extraction.v1", "status": "not_recognised"}')$$,
  (select v from k where name = 'claim2')::jsonb ->> 'run_id', (select v from k where name = 'claim2')::jsonb ->> 'claim_token')), 'completed', 'a not-recognised result completes');
select is((select manual_entry::text || '/' || (select count(*) from public.inbound_order_lines l where l.inbound_order_id = i.id)
             from public.inbound_orders i where id = ((select v from k where name = 'fin2')::jsonb ->> 'inbound_order_id')::uuid),
  'true/0', 'an unknown document gets no values and manual entry');

-- Drafts ------------------------------------------------------------------------
create temp table i as select ((select v from k where name = 'fin')::jsonb ->> 'inbound_order_id')::uuid as id;
grant select on i to authenticated;
select is(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.save_inbound_order_draft(%L, %s, '{"customer_id": "00000000-0000-4000-a200-000000000001", "customer_po_number": "PO-77A"}')::text$$,
    (select id from i), (select version from public.inbound_orders where id = (select id from i))))::jsonb ->> 'ok',
  'true', 'a Processor saves the draft');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.save_inbound_order_draft(%L, 1, '{"notes": "x"}')::text$$, (select id from i))), '^ERR:55000:stale_version', 'a stale draft save is refused');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.save_inbound_order_draft(%L, %s, '{"status": "approved"}')::text$$, (select id from i), (select version from public.inbound_orders where id = (select id from i)))),
  '^ERR:22023', 'status cannot be written through the draft');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000006',
  format($$select public.save_inbound_order_draft(%L, %s, '{"notes": "x"}')::text$$, (select id from i), (select version from public.inbound_orders where id = (select id from i)))),
  '^ERR:42501', 'a Viewer cannot edit');
select matches(pg_temp.run('00000000-0000-4000-b500-000000000004',
  format($$select public.save_inbound_order_draft(%L, %s, '{"notes": "x"}')::text$$, (select id from i), (select version from public.inbound_orders where id = (select id from i)))),
  '^ERR:P0002', 'another workspace sees not found');

-- Validation results ------------------------------------------------------------
select is(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.record_validation(%L, %s, '[{"code": "PO_NUMBER_MISSING", "severity": "blocking", "message": "m", "fingerprint": "%s"}, {"code": "REQUESTED_DATE_PAST", "severity": "warning", "message": "w", "fingerprint": "%s"}]')::text$$,
    (select id from i), (select version from public.inbound_orders where id = (select id from i)), repeat('1', 64), repeat('2', 64)))::jsonb ->> 'ok',
  'true', 'validation results are recorded for the saved version');
select is((select validated_version = version from public.inbound_orders where id = (select id from i)), true, 'the version is marked as validated');
select is(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.acknowledge_exception(%L)::text$$, (select id from public.order_exceptions where inbound_order_id = (select id from i) and code = 'REQUESTED_DATE_PAST')))::jsonb ->> 'ok',
  'true', 'a warning can be acknowledged');
select matches(pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.acknowledge_exception(%L)::text$$, (select id from public.order_exceptions where inbound_order_id = (select id from i) and code = 'PO_NUMBER_MISSING'))),
  '^ERR:55000', 'a blocking exception cannot be acknowledged');
-- Same warning, changed values: it re-opens. The blocking one is no longer raised: it closes.
select pg_temp.run('00000000-0000-4000-a500-000000000004',
  format($$select public.record_validation(%L, %s, '[{"code": "REQUESTED_DATE_PAST", "severity": "warning", "message": "w", "fingerprint": "%s"}]')::text$$,
    (select id from i), (select version from public.inbound_orders where id = (select id from i)), repeat('3', 64)));
select is((select array_agg(code || ':' || status order by code) from public.order_exceptions where inbound_order_id = (select id from i)),
  array['PO_NUMBER_MISSING:resolved', 'REQUESTED_DATE_PAST:open'], 'changed values re-open; conditions that are gone close');

-- Matching ----------------------------------------------------------------------
select is(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select string_agg(sku || ':' || method, ',') from public.match_products('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '[{"key": "1", "part": "HP-221"}]')$$),
  'JAN-1001:alias', 'a customer part number matches through the alias first');
select is(pg_temp.run('00000000-0000-4000-a500-000000000004',
  $$select method from public.match_customers('00000000-0000-4000-a000-000000000001', 'Someone', 'C-1042') limit 1$$),
  'account_number', 'an account number on the document is the strongest customer signal');
select is(pg_temp.run('00000000-0000-4000-b500-000000000004',
  $$select count(*)::text from public.match_products('00000000-0000-4000-a000-000000000001', '00000000-0000-4000-a200-000000000001', '[{"key": "1", "part": "HP-221"}]')$$),
  '0', 'matching never sees another workspace''s products');

-- Price gate (PRICE_MISMATCH needs a recorded decision) -------------------------
update public.inbound_order_lines set product_id = '00000000-0000-4000-a400-000000000001', match_method = 'alias', unit_price = 9.50, price_source = 'po_price', field_meta = '{}'
 where inbound_order_id = (select id from i);
select ok(private.intake_gate((select i2 from public.inbound_orders i2 where i2.id = (select id from i)), 'approve') @> '[{"code": "PRICE_MISMATCH"}]',
  'a price above the expected price without a decision fails the gate');
update public.inbound_order_lines set field_meta = '{"unit_price": {"price_decision": "po"}}' where inbound_order_id = (select id from i);
select ok(not private.intake_gate((select i2 from public.inbound_orders i2 where i2.id = (select id from i)), 'approve') @> '[{"code": "PRICE_MISMATCH"}]',
  'with the reviewer''s decision recorded, the price passes the gate');

select * from finish();
rollback;
