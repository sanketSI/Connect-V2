-- ============================================================
-- 0002_harden_rls.sql — shrink the anon surface to what the app actually uses.
--
-- Run AFTER 0001_init.sql (and after supabase/seed.sql, in either order).
-- Idempotent: every statement is `if exists` / `if not exists` / a re-runnable
-- GRANT, so applying it twice is a no-op. 0001_init.sql is NOT edited — it is
-- already applied to a live database; everything here is additive.
--
-- WHAT 0001 LEFT OPEN (three auditors independently rated these CRITICAL/HIGH):
--   1. `using (true)` SELECT on all 13 tables for `anon` → anyone holding the
--      public anon key could read EVERY customer phone number, every access
--      request, every manager contact.
--   2. anon UPDATE on `calls` and `stores` across ALL columns → anyone could
--      rewrite an AI summary, flip `spam`, edit a transcript's parent, or
--      re-parent a store to a different dealer (`stores.dealer_id`).
--   3. anon INSERT on `access_requests` with `with check (true)` → anyone could
--      insert a request already marked `approved`, forging their own approval.
--
-- WHAT THIS MIGRATION DOES (see each section for the reasoning):
--   • Replaces the blanket table privileges with an explicit allow-list.
--   • Removes anon read access from `managers` and `access_requests` entirely —
--     verified unread by the app (see the grep evidence in section B).
--   • Narrows anon UPDATE to the exact columns the app writes, via
--     column-level GRANTs (RLS is row-level and cannot express this; only
--     GRANTs can).
--   • Narrows anon INSERT to the exact columns the app writes, and forces
--     `access_requests.status = 'pending'`.
--   • CLOSES THE RAW PHONE NUMBERS. `dealers.phone` (the login credential) and
--     `customers.phone` (consumer PII) are unreadable by anon: no grant on
--     `dealers` at all, and a column-level grant on `customers` that omits
--     `phone`. Section D ships what the client reads instead — two masked,
--     security-barrier VIEWS and two SECURITY DEFINER RPCs that answer the same
--     questions with masked strings and opaque ids. The client changes that made
--     this possible landed with this migration; section D maps each of the three
--     behaviours from where it was to where it went.
--
-- WHAT IT DELIBERATELY LEAVES OPEN, and why:
--   The app has NO auth. Every request is `anon`, so there is no identity to
--   scope rows against — a row-level policy cannot ask "whose data is this?"
--   when nobody is signed in. Read access to the DEMO tables therefore stays
--   open by design. That is safe exactly as long as the database holds seeded
--   demo data and nothing else. THE MOMENT REAL DEALER DATA LANDS, the block
--   below is the migration to run.
--
-- ============================================================
-- ############################################################
-- ##  STEP 3 — FULL LOCKDOWN, once real auth ships.          ##
-- ##  Paste as 0004_auth_scoped_rls.sql. Written down here   ##
-- ##  so the path is not re-derived under pressure.          ##
-- ############################################################
--
-- -- 1. Bind a Supabase auth user to a manager, and a manager to a dealer.
-- alter table managers add column if not exists auth_user_id uuid unique
--   references auth.users(id) on delete set null;
-- create index if not exists idx_managers_auth_user_id on managers (auth_user_id);
--
-- -- 2. The one function every policy leans on: the dealer the caller works for.
-- --    STABLE + SECURITY DEFINER so the policies can read `managers` without
-- --    the caller needing SELECT on it (and without recursing into RLS).
-- create or replace function public.current_dealer_id()
-- returns text language sql stable security definer set search_path = public as $$
--   select m.dealer_id from managers m where m.auth_user_id = auth.uid() limit 1;
-- $$;
-- revoke all on function public.current_dealer_id() from public;
-- grant execute on function public.current_dealer_id() to authenticated;
--
-- -- 3. anon keeps NOTHING except the ability to ask for access.
-- revoke all on all tables in schema public from anon;
-- grant usage on schema public to anon;
-- grant insert (store_code, current_phone, new_phone, reason)
--   on access_requests to anon;
-- drop policy if exists dealers_anon_select                  on dealers;
-- drop policy if exists stores_anon_select                   on stores;
-- drop policy if exists managers_anon_select                 on managers;
-- drop policy if exists customers_anon_select                on customers;
-- drop policy if exists customer_timeline_events_anon_select on customer_timeline_events;
-- drop policy if exists customer_notes_anon_select           on customer_notes;
-- drop policy if exists calls_anon_select                    on calls;
-- drop policy if exists call_transcript_turns_anon_select    on call_transcript_turns;
-- drop policy if exists reviews_anon_select                  on reviews;
-- drop policy if exists review_replies_anon_select           on review_replies;
-- drop policy if exists media_assets_anon_select             on media_assets;
-- drop policy if exists post_templates_anon_select           on post_templates;
-- drop policy if exists customer_notes_anon_insert           on customer_notes;
-- drop policy if exists calls_anon_update                    on calls;
-- drop policy if exists stores_anon_update                   on stores;
--
-- -- 4. authenticated sees exactly its own dealer's tree.
-- --    NOTE: this blanket grant hands `customers.phone` and `dealers.phone`
-- --    back to a signed-in caller — narrowed by the policies below to their own
-- --    dealer's rows, which is the point of having auth. If the product does not
-- --    need raw numbers on the client even then, keep section A's column grant
-- --    for `customers` and let this file grant the rest.
-- grant select on all tables in schema public to authenticated;
-- create policy dealers_own on dealers for select to authenticated
--   using (id = public.current_dealer_id());
-- create policy stores_own on stores for select to authenticated
--   using (dealer_id = public.current_dealer_id());
-- create policy managers_own on managers for select to authenticated
--   using (dealer_id = public.current_dealer_id());
-- create policy customers_own on customers for select to authenticated
--   using (exists (select 1 from stores s
--                   where s.id = customers.store_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy calls_own on calls for select to authenticated
--   using (exists (select 1 from stores s
--                   where s.id = calls.store_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy reviews_own on reviews for select to authenticated
--   using (exists (select 1 from stores s
--                   where s.id = reviews.store_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy media_assets_own on media_assets for select to authenticated
--   using (exists (select 1 from stores s
--                   where s.id = media_assets.store_id
--                     and s.dealer_id = public.current_dealer_id()));
-- -- child tables scope through their parent
-- create policy cte_own on customer_timeline_events for select to authenticated
--   using (exists (select 1 from customers c join stores s on s.id = c.store_id
--                   where c.id = customer_timeline_events.customer_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy customer_notes_own on customer_notes for select to authenticated
--   using (exists (select 1 from customers c join stores s on s.id = c.store_id
--                   where c.id = customer_notes.customer_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy ctt_own on call_transcript_turns for select to authenticated
--   using (exists (select 1 from calls k join stores s on s.id = k.store_id
--                   where k.id = call_transcript_turns.call_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy review_replies_own on review_replies for select to authenticated
--   using (exists (select 1 from reviews r join stores s on s.id = r.store_id
--                   where r.id = review_replies.review_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy post_templates_all on post_templates for select to authenticated
--   using (true);  -- reference data, not dealer-scoped
-- -- writes: same scope, same narrow column grants as section C below.
-- create policy calls_own_update on calls for update to authenticated
--   using (exists (select 1 from stores s
--                   where s.id = calls.store_id
--                     and s.dealer_id = public.current_dealer_id()))
--   with check (exists (select 1 from stores s
--                   where s.id = calls.store_id
--                     and s.dealer_id = public.current_dealer_id()));
-- create policy stores_own_update on stores for update to authenticated
--   using (dealer_id = public.current_dealer_id())
--   with check (dealer_id = public.current_dealer_id());
-- create policy customer_notes_own_insert on customer_notes for insert to authenticated
--   with check (exists (select 1 from customers c join stores s on s.id = c.store_id
--                        where c.id = customer_notes.customer_id
--                          and s.dealer_id = public.current_dealer_id()));
-- ############################################################

begin;

-- ============================================================
-- A. PRIVILEGE BASELINE — stop relying on Supabase's blanket default grants.
--
-- Supabase ships `grant all on all tables in schema public to anon,
-- authenticated`. RLS policies then decide WHICH ROWS are visible, but nothing
-- decides WHICH COLUMNS may be written — that is a GRANT, and the blanket grant
-- said "all of them". So we drop the blanket and re-grant deliberately below.
--
-- `authenticated` is treated exactly like `anon` here: the app has no sign-in,
-- so a token-bearing caller must not be MORE privileged than a plain visitor
-- until the STEP 3 block above actually lands.
-- `service_role` is untouched — server-side jobs keep full access.
-- ============================================================
revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
-- CAVEAT: Supabase's ALTER DEFAULT PRIVILEGES still grants ALL on any table
-- created LATER in this schema. Every future migration that adds a table must
-- re-run the revoke above (or add the table to this allow-list explicitly).

-- Reads the app genuinely performs at boot (packages/core/data/hydrate.js).
-- These nine hold no phone number in any column, so the whole row is grantable
-- and hydrate keeps its `select('*')`.
grant select on stores                   to anon, authenticated;
grant select on customer_timeline_events to anon, authenticated;
grant select on customer_notes           to anon, authenticated;
grant select on calls                    to anon, authenticated;
-- ⚠ KNOWN OPEN RISK — call_transcript_turns is verbatim consumer speech, the most
-- sensitive content in this schema and squarely personal data under the DPDP Act.
-- It stays anon-readable because the transcript IS a shipped feature (the call-detail
-- sheet renders it) and, with no authentication yet, "readable by the dealer who owns
-- the call" and "readable by anon" are the same grant. It cannot be masked and remain
-- useful, so this is an accepted DEMO-ONLY exposure, not an oversight.
--   Closed by STEP 3 (auth): drop this grant, add
--   `using (call_id in (select id from calls where store_id in (dealer_stores())))`.
--   DO NOT point this deployment at real recorded calls before that lands.
grant select on call_transcript_turns    to anon, authenticated;
grant select on reviews                  to anon, authenticated;
grant select on review_replies           to anon, authenticated;
grant select on media_assets             to anon, authenticated;
grant select on post_templates           to anon, authenticated;

-- ---- customers: EVERY COLUMN EXCEPT `phone` -----------------
-- `customers.phone` is consumer PII — the mini-CRM's dialable numbers — and the
-- anon key that would read it ships inside the JavaScript bundle. The absence of
-- `phone` from this list IS the revoke: a column-level grant is a closed set, so
-- `select *` on this table now fails for anon by design and any query naming
-- `phone` is rejected outright, independent of every policy predicate.
--
-- The client does not lose the column, it loses the DIGITS: hydrate reads
-- `customers_public` (section D), whose `phone` is the masked display string.
-- `updated_at` (added later by 0003) is deliberately absent too — nothing reads it.
grant select (
  id, store_id, seq, name,
  cli, band, value, category, category_key, ai_guess, ai_guess_key,
  first_seen_label, first_seen_at, last_seen_label, last_seen_at,
  call_count, review_sent, reviewed, created_at
) on customers to anon, authenticated;

-- ---- dealers: NOTHING ---------------------------------------
-- `dealers.phone` IS the login credential (sign-in is phone + store code + OTP),
-- so a reader of this table can enumerate every account name in the system. The
-- app has no reason to read it any more: hydrate takes the registry from
-- `dealer_store_registry` and its own identity from `dealer_for_phone()`, both
-- of which read this table with the OWNER's rights (section D) and hand back
-- masked strings and opaque ids.
-- The blanket revoke above already removed it; stated explicitly so that a
-- future `grant select on dealers` shows up as a contradiction in review.
revoke select on dealers from anon, authenticated;

-- ============================================================
-- B. READS THE APP NEVER PERFORMS — closed, not merely policied.
--
-- Evidence (ripgrep over packages/core and apps/web/src, 2026-07-21):
--   grep -rn "managers"       → 0 hits outside the schema/seed
--   grep -rn "access_request" → 0 hits outside the schema/seed
-- hydrate.js's fetch list names 9 tables and 2 masked views; neither is on it.
--
-- Both hold phone numbers:
--   managers.phone         — the team's contact numbers
--   access_requests.*_phone — the number on file AND the number asking, i.e.
--                             an unauthenticated stranger's mobile number.
-- Reading either was pure leak with no product behind it. Both are now
-- unreadable by anon/authenticated: privilege removed in section A and never
-- re-granted, plus the policies dropped so nothing can accidentally re-open it.
-- ============================================================
drop policy if exists managers_anon_select        on managers;
drop policy if exists access_requests_anon_select on access_requests;

-- ============================================================
-- C. WRITES — narrowed to the exact columns the app writes.
--
-- Column-level GRANTs are the mechanism: an UPDATE naming any column the role
-- lacks privilege on is rejected outright, so this is a hard ceiling on what a
-- forged request can touch, independent of any policy predicate.
-- ============================================================

-- ---- calls -------------------------------------------------
-- Written by packages/core/data/calls.js only:
--   setLeadStatus()     → update({ lead_status })      (line 271)
--   setReviewLinkSent() → update({ review_link_sent }) (line 293)
-- Everything else on `calls` is now read-only to anon: summary, highlights,
-- sentiment, cli, est_value, spam, at, store_id, customer_id — an attacker can
-- no longer rewrite the record of what a customer said, flip a real call to
-- spam, or move a call to another store.
-- (The CHECK constraints from 0001 still bound the two writable columns to
-- their legal values, so no `with check` predicate is needed to repeat them.)
grant update (lead_status, review_link_sent) on calls to anon, authenticated;

-- ---- stores ------------------------------------------------
-- Written by packages/core/data/locations.js → verifyLocation() (lines 110-118).
-- It writes `verified` + `verified_at` AND the address/geo corrections the
-- on-site verification flow captures, so the grant must cover those too or the
-- feature breaks with "permission denied for table stores".
-- Critically NOT granted: dealer_id (re-parenting a store to another dealer),
-- store_code (identity theft of a store), rating, reviews_count, health,
-- missed_count/answered_count/recovered_count/recovery_pct (the numbers the
-- whole product is judged on), is_primary, seq, name, branch.
grant update (
  verified, verified_at,
  address, pincode, city, state, landmark,
  stated_lat, stated_lng, actual_lat, actual_lng
) on stores to anon, authenticated;

-- ---- review_replies -----------------------------------------
-- Written by packages/core/data/reviews.js → postReviewReply(). Without this
-- grant AND the policy below, a live publish fails "permission denied" and the
-- mutator's fire-and-forget swallows it: the manager sees their reply on screen
-- while the database never receives it. `deleted`/`deleted_at` are NOT grantable
-- — retracting a published reply is a moderation action, not a client write.
-- NB: the reply-text column is `body` (0001_init.sql:266); the app field is `.text`
-- and the mutator maps text->body on write. This grant/policy MUST name the real
-- column `body`, or the whole transaction aborts on apply and the phone-privacy
-- hardening above rolls back with it.
grant insert (id, review_id, platform, body, author, at) on review_replies to anon, authenticated;

drop policy if exists review_replies_anon_insert on review_replies;
create policy review_replies_anon_insert on review_replies
  for insert to anon, authenticated
  with check (
    body <> ''
    and length(body) <= 4000
    -- Only where the platform actually accepts replies (mirrors canPublishReply()).
    and platform in ('gbp', 'justdial')
  );

-- ---- customer_notes ----------------------------------------
-- Written by packages/core/data/customers.js → addCustomerNote() (line 176):
-- id, customer_id, author, body, at. created_at keeps its default.
grant insert (id, customer_id, author, body, at) on customer_notes to anon, authenticated;

-- Bound the payload: a note is a manager's typed remark, not a blob store.
-- (The app's own composer is far below this ceiling; this only stops abuse.)
drop policy if exists customer_notes_anon_insert on customer_notes;
create policy customer_notes_anon_insert on customer_notes
  for insert to anon, authenticated
  with check (
    body <> ''
    and length(body) <= 4000
    and length(coalesce(author, '')) <= 120
    and at <= now() + interval '1 day'
  );

-- ---- access_requests ---------------------------------------
-- Unauthenticated INSERT is the entire point of this table (the login sheet's
-- "this store isn't mapped to my number" flow), so it stays open — but it can
-- only ever create a PENDING request:
--   • `status` is not in the column grant, so it cannot be supplied at all and
--     always falls to its 'pending' default;
--   • the policy asserts it anyway, so a future widening of the grant cannot
--     silently re-open forged approvals.
-- `id` is `generated always as identity` and cannot be supplied either.
grant insert (store_code, current_phone, new_phone, reason) on access_requests to anon, authenticated;

drop policy if exists access_requests_anon_insert on access_requests;
create policy access_requests_anon_insert on access_requests
  for insert to anon, authenticated
  with check (
    status = 'pending'
    and new_phone ~ '^[0-9]{10}$'
    and (current_phone is null or current_phone ~ '^[0-9]{10}$')
    and (reason is null or reason in ('joined', 'changed', 'multi'))
  );

-- The write policies from 0001 are recreated verbatim (still `using (true)` —
-- there is no identity to scope rows against yet). The GRANTs above are what
-- actually shrank; these exist so the policy set is stated in one place.
drop policy if exists calls_anon_update  on calls;
create policy calls_anon_update  on calls  for update to anon, authenticated using (true) with check (true);
drop policy if exists stores_anon_update on stores;
create policy stores_anon_update on stores for update to anon, authenticated using (true) with check (true);

-- ============================================================
-- D. RAW PHONE NUMBERS — closed, and what replaced them.
--
-- THE PROBLEM
--   dealers.phone   is the login credential (mobile + store code + OTP).
--   customers.phone is consumer PII (the mini-CRM's dialable numbers).
-- Section A revoked both. This section is what the client reads instead: two
-- masked views and two RPCs that answer the SAME questions without a number
-- ever crossing the wire.
--
-- The three behaviours that used to require the raw column, and where each one
-- went (the client side landed with this migration, not after it):
--
--   1. "which stores belong to the signed-in dealer?"
--      was  hydrate.js  dealerById.get(s.dealer_id)?.phone === DEALER_PHONE
--      now  dealer_for_phone() resolves this build's sign-in number to an
--           OPAQUE dealer id, once, server-side; hydrate compares that id to
--           `stores.dealer_id`. An id comparison, not a phone comparison.
--
--   2. "does this store code belong to this number?"
--      was  registry rows carried the dealer phone; session.js compared strings
--      now  verify_store_login() decides it server-side and returns the same
--           three discriminators the screens branch on. The registry the client
--           holds comes from dealer_store_registry: code, location id, opaque
--           dealer id, and a PRE-MASKED display string. No digits in it at all.
--
--   3. the customer sheet's `tel:` link
--      was  customers.phone → a real +91 link
--      now  hydrated customer records hold the mask and nothing else, so
--           customerDialDigits() returns null and the screen draws the disabled
--           control it already had for "we hold no number". Deliberately NOT an
--           RPC that returns one customer's digits: with no auth in front of it,
--           and every customer id published by customers_public, that is the
--           same full dump with a log line attached. See the long note on
--           customerDialDigits() in packages/core/data/customers.js.
--
--   The views are SECURITY DEFINER by construction (owned by the migration
--   runner, no `security_invoker`): they read the base table with the owner's
--   rights and expose only the masked expression, so anon needs — and gets —
--   no privilege on the underlying column. Supabase's linter flags this as
--   "security definer view"; that is the intent here, not a mistake. Do not
--   "fix" it by adding security_invoker = true — that would require anon to
--   hold SELECT on the raw column and defeat the entire section.
-- ============================================================

-- Masked customers. `phone` keeps its NAME and its masking rule identical to the
-- seed's maskCustomer() (last 3 digits), so hydrate maps this column straight
-- onto the record's `masked` field and every screen renders exactly the string
-- it rendered before. hydrate names its columns explicitly (CUSTOMER_COLUMNS)
-- rather than `select *`, so a column added to this view later cannot start
-- leaking into the bundle unnoticed.
drop view if exists public.customers_public;
create view public.customers_public
with (security_barrier = true) as
  select
    id, store_id, seq, name,
    case
      when phone is null or phone = '' then null
      else '+91 ●●●●● ●●' || right(regexp_replace(phone, '\D', '', 'g'), 3)
    end as phone,
    cli, band, value, category, category_key, ai_guess, ai_guess_key,
    first_seen_label, first_seen_at, last_seen_label, last_seen_at,
    call_count, review_sent, reviewed, created_at
  from public.customers;
comment on view public.customers_public is
  'Masked read model for customers: same columns, phone reduced to its last 3 digits. Read this instead of public.customers from any anon client.';
grant select on public.customers_public to anon, authenticated;

-- ⚠ KNOWN OPEN RISK — CREDENTIAL-RECOVERY ORACLE (rate-limit before real data)
-- This view publishes 4 of the 10 digits of every dealer's login number, and
-- `dealer_for_phone()` / `verify_store_login()` are anon-EXECUTE equality oracles.
-- Together they cut a brute-force search from 10^10 to ~10^6 unthrottled guesses.
-- Both exist ONLY because there is no authentication: the client must derive
-- ownership somehow, and the access sheet must show "the number on file".
--   Mitigation before any real dealer data:
--     1. move both RPCs behind a rate-limited Edge Function, revoke anon EXECUTE;
--     2. once auth lands, ownership comes from auth.uid() and both disappear.
-- The mask FORMAT is app-wide (maskPhone) and deliberately not changed here.

-- The store-code registry WITHOUT raw dealer numbers. `phone_masked` uses the
-- app's own maskPhone() rule (session.js:30 — first 2 and last 2 digits), so
-- it can be rendered verbatim as "the number on file" on the access sheet.
drop view if exists public.dealer_store_registry;
create view public.dealer_store_registry
with (security_barrier = true) as
  select
    s.store_code                as code,
    s.id                        as location_id,
    d.id                        as dealer_id,
    '+91 ' || left(regexp_replace(d.phone, '\D', '', 'g'), 2) || '•••• ••'
            || right(regexp_replace(d.phone, '\D', '', 'g'), 2) as phone_masked
  from public.stores s
  join public.dealers d on d.id = s.dealer_id;
comment on view public.dealer_store_registry is
  'Login registry (store code → location) with the dealer phone masked. Replaces reading dealers.phone client-side.';
grant select on public.dealer_store_registry to anon, authenticated;

-- WHO AM I? — the identity lookup that replaced reading dealers.phone at boot.
-- Takes the number this build signs in as and returns an OPAQUE dealer id, or
-- null. Nothing identifying comes back: the caller learns only whether the
-- number it already typed is registered, and under which internal id.
-- packages/core/data/hydrate.js calls this once, then decides which stores are
-- the dealer's by comparing that id to `stores.dealer_id`.
create or replace function public.dealer_for_phone(p_phone text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.id
    from dealers d
   where regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
     and regexp_replace(d.phone, '\D', '', 'g')
       = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
   limit 1;
$$;
comment on function public.dealer_for_phone(text) is
  'Phone → opaque dealer id, or null. Returns no phone number. Replaces reading dealers.phone client-side.';
revoke all on function public.dealer_for_phone(text) from public;
grant execute on function public.dealer_for_phone(text) to anon, authenticated;

-- The only question the client actually needed the raw dealer phone for:
-- "does this store code belong to this number?". Answering it server-side means
-- the number never travels. Mirrors resolveStoreCode()'s discriminators so the
-- client keeps its existing branch names.
--   'ok'          → the code is mapped to this number   (+ location_id, dealer_id)
--   'notMapped'   → the code exists, other owner        (+ phone_on_file_masked)
--   'notFound'    → no such code
-- `dealer_id` lets a client bind "this number is that dealer" from the server's
-- answer instead of guessing; it is the same opaque id dealer_for_phone returns.
-- Dropped first because the return type changed — `create or replace` cannot.
--
-- Note this is an ORACLE by design (it confirms a code exists, and hands back a
-- masked number for a code you do not own); pair it with rate limiting on the
-- login route before real launch. dealer_for_phone above is an oracle of the
-- same family (is this number registered?) and wants the same limiter.
drop function if exists public.verify_store_login(text, text);
create function public.verify_store_login(p_store_code text, p_phone text)
returns table (status text, location_id text, dealer_id text, phone_on_file_masked text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_code   text := upper(regexp_replace(coalesce(p_store_code, ''), '[\s_]', '', 'g'));
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_rec    record;
begin
  -- Same tolerance as normalizeStoreCode() (session.js): accept a code typed
  -- without its hyphens rather than rejecting it.
  if v_code !~ '-' and v_code ~ '^[A-Z]{3}[A-Z]{3}[0-9]{2}$' then
    v_code := regexp_replace(v_code, '^([A-Z]{3})([A-Z]{3})([0-9]{2})$', '\1-\2-\3');
  end if;

  select s.id  as store_id,
         d.id  as owner_id,
         regexp_replace(d.phone, '\D', '', 'g') as dealer_digits
    into v_rec
    from stores s
    join dealers d on d.id = s.dealer_id
   where s.store_code = v_code;

  if not found then
    return query select 'notFound'::text, null::text, null::text, null::text;
    return;
  end if;

  if v_rec.dealer_digits is distinct from v_digits then
    return query select
      'notMapped'::text,
      null::text,
      null::text,
      '+91 ' || left(v_rec.dealer_digits, 2) || '•••• ••' || right(v_rec.dealer_digits, 2);
    return;
  end if;

  return query select 'ok'::text, v_rec.store_id, v_rec.owner_id, null::text;
end;
$$;
revoke all on function public.verify_store_login(text, text) from public;
grant execute on function public.verify_store_login(text, text) to anon, authenticated;

commit;

-- ############################################################
-- ##  STEP 2 IS APPLIED — it is section A of this file.      ##
-- ##                                                         ##
-- ##  It used to sit here commented out, waiting on a client ##
-- ##  that still read raw numbers. That client is gone:      ##
-- ##                                                         ##
-- ##   packages/core/data/hydrate.js  — reads customers_public##
-- ##     and dealer_store_registry, names its columns, and    ##
-- ##     resolves its own dealer id through dealer_for_phone. ##
-- ##     It no longer fetches `dealers` at all.               ##
-- ##   packages/core/data/session.js  — ownership is an id    ##
-- ##     comparison (ownerMatches), and verifyStoreLogin()    ##
-- ##     defers to verify_store_login when a client is live.  ##
-- ##   packages/core/data/customers.js — customerDialDigits() ##
-- ##     returns null on a live backend and the call-back     ##
-- ##     button renders disabled, on purpose.                 ##
-- ##                                                         ##
-- ##  So the grants in section A are the final ones, and anon ##
-- ##  can no longer read a raw phone number anywhere:         ##
-- ##    dealers.phone    — no grant at all                    ##
-- ##    customers.phone  — absent from the column grant       ##
-- ##    managers.phone   — table unreadable (section B)       ##
-- ##    access_requests  — table unreadable (section B)       ##
-- ##                                                         ##
-- ##  ORDERING: run 0001 → 0002 → 0003. 0003 only ADDS        ##
-- ##  columns (updated_at, recording_*, sync_*) to tables that ##
-- ##  hold table-level grants, so they inherit SELECT — except ##
-- ##  customers.updated_at, which a column grant deliberately  ##
-- ##  does not cover and nothing reads. 0003 creates no table, ##
-- ##  so Supabase's ALTER DEFAULT PRIVILEGES cannot re-open    ##
-- ##  anything behind this file. Any LATER migration that adds ##
-- ##  a table must re-run section A's revoke (see its caveat). ##
-- ##                                                         ##
-- ##  STILL OPEN, by design: the demo tables stay world-       ##
-- ##  readable because there is no identity to scope them to.  ##
-- ##  STEP 3 at the top of this file is that migration.        ##
-- ############################################################
