-- OrderPilot Phase 4A · Migration 17: document storage, upload lifecycle and
-- applying extraction results. DATABASE_ARCHITECTURE.md §6.4, §6.6, §11;
-- TECHNICAL_ARCHITECTURE.md §8 and §9.

-- ---------------------------------------------------------------------------
-- Private bucket and storage policies (§11). No update or delete policies:
-- stored originals can never be replaced or removed by users (PR-03).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('source-documents', 'source-documents', false, 20971520, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy source_documents_read on storage.objects for select to authenticated
  using (
    bucket_id = 'source-documents'
    and (storage.foldername(name))[1] in (select o::text from private.user_org_ids() o)
  );

-- Direct uploads with a user session (signed upload URLs are issued by the
-- server instead, after the same checks).
create policy source_documents_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'source-documents'
    and (storage.foldername(name))[1] in (select o::text from private.user_org_ids_with('intake.upload') o)
    and exists (
      select 1 from public.source_documents d
       where d.organization_id::text = (storage.foldername(name))[1]
         and d.id::text = storage.filename(name)
         and d.upload_status = 'pending'
         and d.uploaded_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Upload lifecycle
-- ---------------------------------------------------------------------------
-- 1. A pending document row (the upload target). Uploader roles only; a
--    simple rate limit protects storage.
create function public.create_pending_document(
  p_organization_id uuid,
  p_filename text,
  p_mime_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform private.assert_permission(p_organization_id, 'intake.upload');
  if not util.has_text(p_filename) or length(p_filename) > 255 then
    raise exception 'validation_failed: the file name is not valid' using errcode = 'invalid_parameter_value';
  end if;
  if p_mime_type not in ('application/pdf', 'image/png', 'image/jpeg') then
    raise exception 'validation_failed: only PDF, PNG and JPEG files are accepted' using errcode = 'invalid_parameter_value';
  end if;
  if p_size_bytes is null or p_size_bytes < 1 or p_size_bytes > 20971520 then
    raise exception 'validation_failed: files must be at most 20 MB' using errcode = 'invalid_parameter_value';
  end if;
  if (select count(*) from public.source_documents d
       where d.uploaded_by = auth.uid() and d.created_at > now() - interval '1 hour') >= 200 then
    raise exception 'rate_limited' using errcode = 'program_limit_exceeded';
  end if;
  insert into public.source_documents (organization_id, original_filename, mime_type, size_bytes, uploaded_by)
  values (p_organization_id, btrim(p_filename), p_mime_type, p_size_bytes, auth.uid())
  returning id into v_id;
  return v_id;
end
$$;

create function private.next_intake_reference(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value bigint;
begin
  insert into public.document_sequences as d (organization_id, sequence_name, period, next_value)
  values (p_organization_id, 'inbound_order', 0, 2)
  on conflict (organization_id, sequence_name, period)
    do update set next_value = d.next_value + 1
  returning next_value - 1 into v_value;
  return 'IN-' || lpad(v_value::text, 6, '0');
end
$$;

-- 2. Finalise (server only, after it has read the stored object and verified
--    its signature, page count and SHA-256). Creates the intake and its first
--    queued extraction run in one transaction, attributed to the uploader.
create function public.finalize_document(
  p_document_id uuid,
  p_user_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_page_count integer,
  p_mime_type text,
  p_session_id uuid,
  p_customer_hint_id uuid default null,
  p_provider text default 'simulated'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.source_documents;
  v_intake public.inbound_orders;
  v_run uuid;
begin
  select * into v_doc from public.source_documents where id = p_document_id for update;
  if not found or v_doc.uploaded_by is distinct from p_user_id then
    raise exception 'not_found' using errcode = 'no_data_found';
  end if;
  if v_doc.upload_status = 'stored' then
    -- Idempotent: a repeated finalise returns the existing intake.
    select * into v_intake from public.inbound_orders where source_document_id = v_doc.id;
    return jsonb_build_object('inbound_order_id', v_intake.id, 'reference', v_intake.reference, 'already_finalized', true,
                              'duplicate_of', private.document_conflicts(v_intake));
  end if;
  if v_doc.upload_status <> 'pending' then
    raise exception 'invalid_state: the upload was rejected' using errcode = 'object_not_in_prerequisite_state';
  end if;
  -- Act as the uploader: role check, actor stamps and audit attribution. The
  -- assurance level comes from the uploader's live session, never the caller.
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id, 'role', 'authenticated', 'session_id', p_session_id,
    'aal', (select s.aal from auth.sessions s where s.id = p_session_id and s.user_id = p_user_id))::text, true);
  perform private.assert_permission(v_doc.organization_id, 'intake.upload');
  if p_mime_type is distinct from v_doc.mime_type then
    raise exception 'validation_failed: the file content does not match its type' using errcode = 'invalid_parameter_value';
  end if;
  if p_customer_hint_id is not null and not exists (
    select 1 from public.customers c
     where c.organization_id = v_doc.organization_id and c.id = p_customer_hint_id and c.status <> 'inactive') then
    raise exception 'validation_failed: unknown customer' using errcode = 'invalid_parameter_value';
  end if;

  update public.source_documents
     set upload_status = 'stored', sha256 = p_sha256, size_bytes = p_size_bytes, page_count = p_page_count, stored_at = now()
   where id = v_doc.id;

  insert into public.inbound_orders (organization_id, reference, source_document_id, customer_hint_id, customer_id, field_meta)
  values (v_doc.organization_id, private.next_intake_reference(v_doc.organization_id), v_doc.id, p_customer_hint_id,
          p_customer_hint_id,
          case when p_customer_hint_id is null then '{}'::jsonb
               else jsonb_build_object('customer_id', jsonb_build_object('source', 'user', 'state', 'suggested', 'note', 'Chosen at upload')) end)
  returning * into v_intake;

  v_run := private.queue_extraction_run(v_intake, 1, 3, now(), p_provider);
  perform private.begin_transition();
  update public.inbound_orders set status = 'extracting' where id = v_intake.id;
  perform private.end_transition();
  perform private.write_audit(v_doc.organization_id, 'inbound_order.received', 'inbound_order', v_intake.id::text,
    null, null, null, null,
    jsonb_build_object('reference', v_intake.reference, 'file', v_doc.original_filename, 'pages', p_page_count));

  return jsonb_build_object('inbound_order_id', v_intake.id, 'reference', v_intake.reference, 'already_finalized', false,
                            'duplicate_of', private.document_conflicts(v_intake));
end
$$;

-- Verification failed: the pending document is rejected (no intake is created).
create function public.reject_document(p_document_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.source_documents
     set upload_status = 'rejected', rejection_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Rejected'), 500)
   where id = p_document_id and upload_status = 'pending';
end
$$;

-- ---------------------------------------------------------------------------
-- Applying extraction results (extraction.v1). The worker has already parsed
-- dates and numbers with our own code (TECHNICAL_ARCHITECTURE.md §9.2).
-- Every extracted value is a suggestion with provenance until confirmed.
-- ---------------------------------------------------------------------------
create function private.ai_meta(p_field jsonb, p_run uuid)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'source', 'ai',
    'state', 'suggested',
    'confidence', p_field -> 'confidence',
    'extraction_run_id', p_run,
    'ai_value', p_field -> 'value',
    'raw', p_field -> 'raw',
    'page', p_field -> 'page',
    'ambiguous', coalesce((p_field ->> 'ambiguous')::boolean, false)
  ))
$$;

create function private.apply_extraction_draft(p_run public.extraction_runs, p_output jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_header jsonb := coalesce(p_output -> 'header', '{}'::jsonb);
  v_meta jsonb := '{}'::jsonb;
  v_field text;
  v_line jsonb;
  v_line_no integer := 0;
  v_value jsonb;
begin
  if coalesce(p_output ->> 'status', 'not_recognised') = 'not_recognised' then
    update public.inbound_orders set manual_entry = true where id = p_run.inbound_order_id;
    return;
  end if;
  if exists (select 1 from public.inbound_order_lines where inbound_order_id = p_run.inbound_order_id) then
    return; -- a draft already exists; never apply twice
  end if;

  foreach v_field in array array['customer_po_number', 'po_date', 'requested_delivery_date', 'currency', 'payment_terms',
                                 'ship_to', 'bill_to', 'notes', 'document_total']
  loop
    if v_header ? v_field and v_header -> v_field ->> 'value' is not null then
      v_meta := v_meta || jsonb_build_object(v_field, private.ai_meta(v_header -> v_field, p_run.id));
    end if;
  end loop;

  update public.inbound_orders i
     set customer_po_number = left(v_header -> 'customer_po_number' ->> 'value', 64),
         po_date = (v_header -> 'po_date' ->> 'value')::date,
         requested_delivery_date = (v_header -> 'requested_delivery_date' ->> 'value')::date,
         currency = upper(v_header -> 'currency' ->> 'value'),
         payment_terms = left(v_header -> 'payment_terms' ->> 'value', 200),
         ship_to = case when jsonb_typeof(v_header -> 'ship_to' -> 'value') = 'object' then v_header -> 'ship_to' -> 'value' end,
         bill_to = case when jsonb_typeof(v_header -> 'bill_to' -> 'value') = 'object' then v_header -> 'bill_to' -> 'value' end,
         notes = left(v_header -> 'notes' ->> 'value', 4000),
         document_total = (v_header -> 'document_total' ->> 'value')::numeric,
         field_meta = i.field_meta || v_meta
   where i.id = p_run.inbound_order_id;

  for v_line in select * from jsonb_array_elements(coalesce(p_output -> 'lines', '[]'::jsonb)) loop
    v_line_no := v_line_no + 1;
    v_meta := '{}'::jsonb;
    if v_line -> 'quantity' ->> 'value' is not null then
      v_meta := v_meta || jsonb_build_object('quantity', private.ai_meta(v_line -> 'quantity', p_run.id));
    end if;
    if v_line -> 'unit_price' ->> 'value' is not null then
      v_meta := v_meta || jsonb_build_object('unit_price', private.ai_meta(v_line -> 'unit_price', p_run.id));
    end if;
    insert into public.inbound_order_lines
      (organization_id, inbound_order_id, line_no, page_number, customer_part_number, description,
       po_quantity, po_uom, po_unit_price, po_line_total, quantity, unit_price, price_source, field_meta)
    values
      (p_run.organization_id, p_run.inbound_order_id, v_line_no, (v_line ->> 'page')::integer,
       left(v_line -> 'customer_part_number' ->> 'value', 64), left(v_line -> 'description' ->> 'value', 1000),
       (v_line -> 'quantity' ->> 'value')::numeric, left(v_line -> 'uom' ->> 'value', 20),
       (v_line -> 'unit_price' ->> 'value')::numeric, (v_line -> 'line_total' ->> 'value')::numeric,
       nullif((v_line -> 'quantity' ->> 'value')::numeric, 0),
       (v_line -> 'unit_price' ->> 'value')::numeric,
       case when v_line -> 'unit_price' ->> 'value' is not null then 'po_price'::public.price_source end,
       v_meta);
  end loop;
end
$$;

create or replace function public.complete_extraction(
  p_run_id uuid,
  p_claim_token uuid,
  p_raw_output jsonb,
  p_overall_confidence numeric default null,
  p_provider_version text default null,
  p_duration_ms integer default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.extraction_runs := private.valid_claim(p_run_id, p_claim_token);
begin
  if v.id is null then
    return 'stale_claim';
  end if;
  if p_raw_output is null or jsonb_typeof(p_raw_output) <> 'object' then
    raise exception 'validation_failed: raw output must be a JSON object' using errcode = 'invalid_parameter_value';
  end if;
  perform set_config('orderpilot.process', 'extraction.worker', true);
  perform private.apply_extraction_draft(v, p_raw_output);
  perform private.begin_transition();
  update public.extraction_runs
     set status = 'succeeded', finished_at = now(), lease_expires_at = null, raw_output = p_raw_output,
         overall_confidence = p_overall_confidence, provider_version = p_provider_version, duration_ms = p_duration_ms
   where id = v.id;
  update public.inbound_orders set status = 'in_review', version = version + 1 where id = v.inbound_order_id;
  perform private.end_transition();
  perform private.write_audit(v.organization_id, 'extraction.completed', 'extraction_run', v.id::text,
    'inbound_order', v.inbound_order_id::text, null, null,
    jsonb_build_object('status', p_raw_output ->> 'status', 'lines', jsonb_array_length(coalesce(p_raw_output -> 'lines', '[]'::jsonb)),
                       'provider_version', p_provider_version));
  return 'completed';
end
$$;

-- An intake that is still extracting: lets the server re-trigger work when
-- someone opens it (TECHNICAL_ARCHITECTURE.md §8).
revoke all on function private.next_intake_reference(uuid) from public, anon, authenticated;
revoke all on function private.ai_meta(jsonb, uuid) from public, anon, authenticated;
revoke all on function private.apply_extraction_draft(public.extraction_runs, jsonb) from public, anon, authenticated;
revoke all on function public.create_pending_document(uuid, text, text, bigint) from public, anon;
revoke all on function public.finalize_document(uuid, uuid, text, bigint, integer, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reject_document(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_extraction(uuid, uuid, jsonb, numeric, text, integer) from public, anon, authenticated;
grant execute on function public.create_pending_document(uuid, text, text, bigint) to authenticated;
grant execute on function public.finalize_document(uuid, uuid, text, bigint, integer, text, uuid, uuid, text) to service_role;
grant execute on function public.reject_document(uuid, text) to service_role;
grant execute on function public.complete_extraction(uuid, uuid, jsonb, numeric, text, integer) to service_role;
