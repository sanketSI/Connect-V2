-- ============================================================
-- 0004_customer_contact_fields.sql — the columns the "add a customer" form needs,
-- and the narrow write grant that lets the client actually create the row.
--
-- ⚠ UNEXECUTED. There is no live database attached to this checkout (no
-- VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local), so nothing below has
-- been run anywhere. It is written to be applied AFTER 0001 → 0002 → 0003, and it
-- is idempotent: every statement is `if not exists` / `if exists` / a re-runnable
-- GRANT or `create policy` guarded by a `drop policy if exists`. 0001/0002/0003 are
-- NOT edited — 0001 is applied to a live database and the other two are staged.
--
-- WHY THIS EXISTS
--   PM feedback: "Flow of addition new customer is missing. While adding new
--   customer, record customer details: NAME, PHONE NUMBER, EMAIL, Address."
--   `customers` holds `name` and `phone` already. It holds NO email and NO
--   address column, so a form capturing them would have collected data the
--   database has nowhere to put — the write would be silently dropped by the
--   mutator's fire-and-forget and the manager would never know. The schema gap
--   is the first thing to close, and it is what bounds the form.
--
-- WHAT IT ADDS
--   customers.email     — consumer PII, same class as customers.phone
--   customers.address   — consumer PII, same class as customers.phone
--   customers.added_by  — who typed this record in (NULL = it came from a call,
--                         or from the seed). The audit floor, and the one fact
--                         that distinguishes a hand-entered contact from a caller
--                         the platform observed.
--   + the INSERT grant + policy that let the anon client create the row at all.
--
-- ############################################################
-- ##  PRIVACY POSTURE — email and address are WRITE-ONLY.    ##
-- ############################################################
-- 0002 section A revoked `customers.phone` from anon by listing every OTHER
-- column in a column-level SELECT grant. That grant is a CLOSED SET, so the two
-- columns added here are, by construction, ALREADY unreadable by anon — a column
-- added to a table that carries only column-level grants inherits no privilege.
-- Nothing below re-grants them, and that is deliberate: an email address and a
-- home address are at least as sensitive as the phone number 0002 spent a whole
-- section closing, and the anon key ships inside the JavaScript bundle.
--
-- So the client can WRITE these three columns and can never READ them back:
--   • hydrate.js reads `customers_public` (0002 section D), and this migration
--     deliberately does NOT add them to that view. `select *` on `customers`
--     already fails for anon, so nothing starts leaking by accident either.
--   • In seed / local mode — the mode this repo actually runs in — the values the
--     manager typed live in the in-memory record and in the app's storage seam
--     (packages/core/data/customers.js), so the screen shows them back to him.
--   • On a hydrated backend the record comes back WITHOUT them, exactly the way
--     `customerDialDigits()` returns null there. The UI degrades truthfully
--     rather than inventing a value.
--
-- TO SHOW THEM BACK ON A LIVE BACKEND, pick one — do not simply grant SELECT:
--   1. masked columns on `customers_public` (e.g. `a•••@gmail.com`, city only),
--      matching what the view already does for `phone`; hydrate.js would need
--      the matching entries in its explicit CUSTOMER_COLUMNS list, or
--   2. the STEP 3 auth-scoped migration written out at the top of 0002, after
--      which "readable by the dealer who owns the row" is finally expressible.
--
-- NO NEW TABLE IS CREATED HERE, so Supabase's ALTER DEFAULT PRIVILEGES cannot
-- re-open anything behind 0002 (see the caveat in its section A).
-- ============================================================

begin;

-- ============================================================
-- A. THE COLUMNS.
--
-- All three are nullable with no default: a customer we have no email for is a
-- real unknown, not a missing value — the same reading `name` already gets in
-- 0001 ("null = anonymous caller"). An empty string would be a claim that we
-- asked and they have none, which is not what a blank form field means.
-- ============================================================
alter table customers add column if not exists email      text;
alter table customers add column if not exists address    text;
alter table customers add column if not exists added_by   text;

comment on column customers.email is
  'Consumer PII. NOT readable by anon — absent from the column grant in 0002 section A and from the customers_public view. Write-only from the client.';
comment on column customers.address is
  'Consumer PII, free text as the manager typed it (India: no reliable structure worth normalising at this stage). NOT readable by anon — see customers.email.';
comment on column customers.added_by is
  'The manager who created this record by hand; NULL = it came from a call or from the seed. Client-supplied and therefore NOT an authenticated identity — the same caveat customer_notes.author carries until STEP 3 auth lands.';

-- ============================================================
-- B. FORMAT CONSTRAINTS — the same shape the client validates, asserted where it
-- cannot be bypassed by a forged request that skips the form.
--
-- `citext`/full RFC 5322 are deliberately not attempted: the job here is to
-- refuse a typo ("rajesh@gmail" / "rajesh gmail.com"), not to prove
-- deliverability, which only sending mail can do. The length caps are the
-- standards' own (254 for an email address, RFC 5321 §4.5.3.1) plus a working
-- ceiling for an address a human types on a phone.
--
-- Wrapped in a DO block that checks pg_constraint, because ADD CONSTRAINT has no
-- IF NOT EXISTS — the same idiom 0003 section B uses.
--
-- Verified safe against the existing data: the 11 seeded customers were inserted
-- before these columns existed, so every value is NULL and NULL passes a CHECK.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_email_check') then
    alter table customers
      add constraint customers_email_check
      check (
        email is null
        -- Byte-for-byte the client's EMAIL_RE (packages/core/data/customers.js).
        -- Two copies of one rule is a drift risk; they are written to be diffable.
        or (email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)*\.[A-Za-z]{2,}$' and length(email) <= 254)
      );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_address_check') then
    alter table customers
      add constraint customers_address_check
      check (address is null or (address <> '' and length(address) <= 500));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_added_by_check') then
    alter table customers
      add constraint customers_added_by_check
      check (added_by is null or (added_by <> '' and length(added_by) <= 120));
  end if;
end $$;

-- The phone this form writes is the one 0003's `customers_store_phone_uniq`
-- already dedupes on, and the client's validation is `/^[6-9]\d{9}$/`. Assert the
-- SHAPE too, so a row created through this new INSERT path can never carry a
-- number no Indian handset could answer. Scoped to rows created BY this path
-- (added_by is not null): the seed's own numbers predate the rule and are not
-- re-validated retroactively.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_manual_phone_check') then
    alter table customers
      add constraint customers_manual_phone_check
      check (added_by is null or phone ~ '^[6-9][0-9]{9}$');
  end if;
end $$;

-- ============================================================
-- C. THE WRITE — anon INSERT on `customers`, narrowed to the exact columns the
-- mutator supplies.
--
-- Written by packages/core/data/customers.js → addCustomer(). Without BOTH the
-- column GRANT and the policy this fails with "permission denied for table
-- customers" and the mutator's fire-and-forget swallows it: the manager sees the
-- customer on screen while the database never receives the row. That is exactly
-- the failure mode 0002 documents for review_replies, so it gets the same
-- treatment — a column-level grant plus a bounded policy.
--
-- DELIBERATELY NOT GRANTED, and therefore NOT SUPPLIABLE:
--   cli, band, value, category, category_key, ai_guess, ai_guess_key
--       — the scores and the AI read. A hand-entered contact has NONE of these:
--         nobody has spoken to them through the platform yet. They stay NULL,
--         which is what the UI renders as "no score yet". A client that could
--         write them could fabricate a hot lead worth ₹5,00,000.
--   call_count, review_sent, reviewed
--       — NOT NULL with defaults (0 / false / false), so they land correctly
--         without being writable. A client cannot claim a call history it does
--         not have.
--   first_seen_label, last_seen_label
--       — the frozen display strings 0003 section F marked DEPRECATED. A new row
--         has no business creating more of them; the timestamps below are the
--         truth.
--   updated_at, created_at
--       — owned by the trigger and the default (0003 section E).
-- ============================================================
grant insert (
  id, store_id, seq,
  name, phone, email, address,
  first_seen_at, last_seen_at,
  added_by
) on customers to anon, authenticated;

drop policy if exists customers_anon_insert on customers;
create policy customers_anon_insert on customers
  for insert to anon, authenticated
  with check (
    -- A hand-entered contact without a name is not a contact — it is the
    -- anonymous ad-caller case, and that row is created by the call pipeline,
    -- not by this form. (0001 keeps `name` nullable precisely for those.)
    name is not null and name <> '' and length(name) <= 120
    -- Reachability is the whole point of the record.
    and phone ~ '^[6-9][0-9]{9}$'
    -- Every row this policy admits is a hand-entered one, and says so. This is
    -- also what keeps customers_manual_phone_check above meaningful.
    and added_by is not null
    -- "First seen" is when the manager added them; it cannot be in the future,
    -- and the day of slack matches the bound customer_notes already uses.
    and first_seen_at is not null and first_seen_at <= now() + interval '1 day'
    and last_seen_at  is not null and last_seen_at  <= now() + interval '1 day'
    -- The store must be one that exists. RLS cannot say "a store the caller
    -- owns" — there is no caller identity until STEP 3 auth lands — but it can
    -- refuse a row parented to a store code somebody made up.
    and exists (select 1 from stores s where s.id = customers.store_id)
    -- email/address/added_by shapes are asserted by the CHECK constraints in
    -- section B, which apply to every writer including service_role. Not
    -- repeated here: one statement of a rule is one place to change it.
  );

-- ============================================================
-- D. WHAT THIS DOES NOT OPEN.
--
-- INSERT only. anon still cannot UPDATE or DELETE a customer: no UPDATE grant on
-- this table exists in 0001, 0002 or here, and no such policy is created. A
-- manager who mistypes a number cannot fix it from the client yet — an honest
-- gap, and a much smaller one than letting anon rewrite every consumer record in
-- the CRM. Editing belongs with auth (STEP 3 in 0002), where "your own dealer's
-- customers" can finally be expressed.
--
-- Nor does it widen SELECT: `customers` keeps the closed column grant from 0002
-- section A, `customers_public` is untouched, and `dealers` still has no grant
-- at all.
-- ============================================================

commit;
