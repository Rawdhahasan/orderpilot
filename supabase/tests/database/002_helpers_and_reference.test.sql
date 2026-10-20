-- Pure helper functions and global reference data.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(25);

-- PO number normalisation: one fixed rule (C-02, Q-3) ------------------------
select is(util.normalize_po_number('PO-88213'), '88213', 'PO-88213 normalises to 88213');
select is(util.normalize_po_number('po 88213'), '88213', 'po 88213 normalises to 88213');
select is(util.normalize_po_number('88213'), '88213', '88213 stays 88213');
select is(util.normalize_po_number('P.O. 88213'), '88213', 'P.O. 88213 normalises to 88213');
select is(util.normalize_po_number('POX-1'), 'POX1', 'a leading PO not followed by a digit is kept');
select is(util.normalize_po_number('SFG-55120'), 'SFG55120', 'punctuation and spaces are removed');
select is(util.normalize_po_number('PO'), 'PO', 'PO on its own is kept');
select is(util.normalize_po_number(' - '), null, 'a PO number with no letters or digits normalises to NULL');
select is(util.normalize_code('ab-12 c'), 'AB12C', 'codes are uppercased with punctuation removed');

-- GTIN check digits (GS1 mod-10) ---------------------------------------------
select ok(util.gtin_is_valid('96385074'), 'valid GTIN-8');
select ok(util.gtin_is_valid('036000291452'), 'valid GTIN-12');
select ok(util.gtin_is_valid('4006381333931'), 'valid GTIN-13');
select ok(util.gtin_is_valid('10614141000415'), 'valid GTIN-14');
select ok(not util.gtin_is_valid('4006381333932'), 'wrong check digit is rejected');
select ok(not util.gtin_is_valid('12345678'), 'wrong GTIN-8 check digit is rejected');
select ok(not util.gtin_is_valid('123456789'), 'unsupported length is rejected');
select ok(not util.gtin_is_valid('40063813339a1'), 'non-digits are rejected');

-- Address matching key --------------------------------------------------------
select is(util.address_match_key('2250 Walker Rd, Dock 4', 'n8w 3p6'), '2250WALKERRDDOCK4|N8W3P6', 'address key normalises line 1 and postcode');

-- Text helper -----------------------------------------------------------------
select ok(util.has_text('Overdue invoices'), 'text with content counts as text');
select ok(not util.has_text('   '), 'whitespace does not count as a reason');
select ok(not util.has_text(null), 'NULL does not count as a reason');

-- Overridable exception catalogue (PRODUCT_REQUIREMENTS.md §9, D-34) ---------
select is(
  (select array_agg(code::text order by code::text)
     from unnest(enum_range(null::public.exception_code)) code
    where util.exception_is_overridable(code)),
  array['CUSTOMER_ON_HOLD', 'DUPLICATE_DOCUMENT', 'DUPLICATE_PO_NUMBER', 'PO_NUMBER_MISSING'],
  'exactly four exception codes can be overridden by an Approver'
);

-- Reference data ---------------------------------------------------------------
select results_eq(
  'select code::text, minor_unit::int from public.currencies order by code',
  $$values ('CAD', 2), ('EUR', 2), ('GBP', 2), ('USD', 2)$$,
  'the four MVP base currencies exist with two-decimal minor units (D-12, Q-5)'
);
select ok(exists (select 1 from public.uom_codes where code = 'EA'), 'unit EA exists');
select throws_ok(
  $$insert into public.uom_codes (code, name) values ('each', 'Lowercase')$$,
  '23514', null, 'unit codes must be uppercase'
);

select * from finish();
rollback;
