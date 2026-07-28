-- ============================================================
-- 0003_schema_fixes.sql — integrity constraints, sync state, lifecycle stamps.
--
-- Run AFTER 0001_init.sql and 0002_harden_rls.sql. Additive only: 0001 is
-- already applied to a live database and is never edited. Every statement is
-- `if exists` / `if not exists` / `create or replace`, so re-running is a no-op.
--
-- Answers these audit findings:
--   • no UNIQUE constraints beyond the primary keys → duplicate customers and
--     duplicate platform reviews are structurally possible
--   • `platform` is free text on reviews / review_replies → typo'd values split
--     a platform's data in half and nothing notices
--   • no external id / sync state on reviews → syncing with Google or Justdial
--     is impossible: nothing can say "I already have this review"
--   • nowhere to keep a call recording
--   • ZERO lifecycle information — not one table records when a row last changed
--
-- Every new UNIQUE/CHECK below was validated against supabase/seed.sql before
-- being written, so this migration cannot fail on the seeded database. The
-- checks that were run are noted at each constraint.
--
-- COLUMN DROPS: DEFERRED, ALL OF THEM. See section E for the grep evidence.
-- ============================================================

begin;

-- ============================================================
-- A. UNIQUE constraints — the duplicates that must be impossible.
-- ============================================================

-- One customer record per phone per store. Partial, because `phone` is NULL for
-- anonymous ad-callers and those are genuinely distinct people, not duplicates.
-- Verified: the 11 seeded customers all sit on store 'lks-ind' with 11 distinct
-- non-null numbers → no violation.
create unique index if not exists customers_store_phone_uniq
  on customers (store_id, phone)
  where phone is not null;

-- A customer's timeline is an ordered list; two events cannot share a slot.
-- Verified: 21 seeded events, no duplicate (customer_id, seq).
create unique index if not exists customer_timeline_events_customer_seq_uniq
  on customer_timeline_events (customer_id, seq);

-- A location has ONE cover image (the rest are photos).
-- Verified: the seed holds exactly one 'cover' for lks-ind.
create unique index if not exists media_assets_one_cover_per_store_uniq
  on media_assets (store_id)
  where kind = 'cover';

-- One open access request per (store code, requesting number). A second attempt
-- should update the existing request, not stack another one.
-- Verified: access_requests is seeded empty.
create unique index if not exists access_requests_pending_uniq
  on access_requests (store_code, new_phone)
  where status = 'pending';

-- ============================================================
-- B. PLATFORM as a closed set.
--
-- Two different vocabularies, deliberately — they are different things and the
-- app already treats them so:
--   reviews.platform        DISPLAY names of the listing the review came FROM
--                           (SOURCES in seedData.js: 'Google', 'Justdial', …)
--   review_replies.platform PUBLISHING_PLATFORMS ids — where a reply was
--                           PUBLISHED ('gbp' | 'justdial' | 'facebook',
--                           seedData.js:1275-1279)
-- Verified against the seed: reviews hold 'Google' ×20 and 'Justdial' ×1;
-- replies hold 'gbp' ×10 and 'justdial' ×1. Both are inside the sets below.
--
-- Adding a platform is a one-line migration (drop + recreate the constraint) —
-- that friction is the point: an integration lands with a schema change, not
-- with a free-text string nobody validates.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_platform_check') then
    alter table reviews
      add constraint reviews_platform_check
      check (platform in ('Google', 'Justdial', 'Facebook'));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'review_replies_platform_check') then
    alter table review_replies
      add constraint review_replies_platform_check
      check (platform in ('gbp', 'justdial', 'facebook'));
  end if;
end $$;

-- ============================================================
-- C. REVIEW SYNC STATE — without these, platform sync cannot exist.
--
-- A review lives on Google/Justdial first and is copied here. With no record of
-- the platform's own id there is no way to answer "have I already imported
-- this?", so every sync run either duplicates the inbox or has to guess from
-- (author, rating, timestamp) — which silently merges two different customers
-- who left the same star rating in the same hour.
-- ============================================================
alter table reviews add column if not exists external_id      text;
alter table reviews add column if not exists external_url     text;
alter table reviews add column if not exists synced_at        timestamptz;
alter table reviews add column if not exists sync_state       text
  not null default 'local';
alter table reviews add column if not exists sync_error       text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reviews_sync_state_check') then
    alter table reviews
      add constraint reviews_sync_state_check
      check (sync_state in ('local', 'synced', 'stale', 'error'));
  end if;
end $$;

comment on column reviews.external_id is
  'The platform''s own review id. NULL = seeded/local row that no platform has claimed.';
comment on column reviews.sync_state is
  'local = never synced (the seed) · synced = matches the platform · stale = platform changed since our last read · error = last sync failed, see sync_error.';

-- THE dedupe key: one row per (platform, platform review id). Partial so the
-- seeded rows (external_id NULL) are untouched.
create unique index if not exists reviews_platform_external_id_uniq
  on reviews (platform, external_id)
  where external_id is not null;

create index if not exists idx_reviews_synced_at on reviews (synced_at);

-- Replies need the same handle, for the same reason: a reply published to GBP
-- comes back with an id, and without it a re-sync duplicates the reply.
alter table review_replies add column if not exists external_id text;
alter table review_replies add column if not exists synced_at   timestamptz;
create unique index if not exists review_replies_platform_external_id_uniq
  on review_replies (platform, external_id)
  where external_id is not null;

-- ============================================================
-- D. CALL RECORDINGS — the storage handle the product will need.
-- A Supabase Storage object path, not a URL: URLs expire and are re-signed,
-- the path is the stable fact. NULL = we hold no recording for this call
-- (which is most of them, and is not an error).
-- ============================================================
alter table calls add column if not exists recording_path text;
alter table calls add column if not exists recording_duration_sec int;
comment on column calls.recording_path is
  'Storage object path for the call recording (bucket-relative), NULL when none. Never a signed URL — sign on read.';

-- ============================================================
-- E. LIFECYCLE — updated_at + a moddatetime-style trigger.
--
-- 0001 recorded created_at and nothing else: the mutable tables could be
-- rewritten with no trace whatsoever. `updated_at` is the floor of an audit
-- story (the ceiling — who changed it, from what — needs real auth and a
-- history table, and is deliberately out of scope here).
--
-- The trigger function is hand-rolled rather than the `moddatetime` extension:
-- same behaviour, no extension dependency, and it works on a plain Postgres as
-- well as on Supabase.
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

alter table calls          add column if not exists updated_at timestamptz not null default now();
alter table stores         add column if not exists updated_at timestamptz not null default now();
alter table customers      add column if not exists updated_at timestamptz not null default now();
alter table reviews        add column if not exists updated_at timestamptz not null default now();
alter table customer_notes add column if not exists updated_at timestamptz not null default now();

drop trigger if exists trg_calls_updated_at          on calls;
create trigger trg_calls_updated_at          before update on calls          for each row execute function public.set_updated_at();
drop trigger if exists trg_stores_updated_at         on stores;
create trigger trg_stores_updated_at         before update on stores         for each row execute function public.set_updated_at();
drop trigger if exists trg_customers_updated_at      on customers;
create trigger trg_customers_updated_at      before update on customers      for each row execute function public.set_updated_at();
drop trigger if exists trg_reviews_updated_at        on reviews;
create trigger trg_reviews_updated_at        before update on reviews        for each row execute function public.set_updated_at();
drop trigger if exists trg_customer_notes_updated_at on customer_notes;
create trigger trg_customer_notes_updated_at before update on customer_notes for each row execute function public.set_updated_at();

create index if not exists idx_calls_updated_at          on calls (updated_at);
create index if not exists idx_stores_updated_at         on stores (updated_at);
create index if not exists idx_customers_updated_at      on customers (updated_at);
create index if not exists idx_reviews_updated_at        on reviews (updated_at);
create index if not exists idx_customer_notes_updated_at on customer_notes (updated_at);

-- `updated_at` is set by the trigger, never by a client. It is NOT in any anon
-- column grant (0002 section C), so anon cannot backdate its own edits.

-- ============================================================
-- F. COLUMN DROPS — ALL FIVE DEFERRED. Evidence, not opinion.
--
-- The audit asked to drop `calls.bucket` (a time-relative fact that rots) and
-- the frozen display strings that duplicate a timestamp (`time_label`,
-- `minutes_ago`, `added_ago`, `first_seen_label`). Every one of them is READ by
-- packages/core today, so dropping any would break hydration — a `select *`
-- returns fewer columns, the mapper reads undefined, and the screens render
-- blanks or, for `bucket`, nothing at all.
--
-- ripgrep over packages/core (2026-07-21):
--
--   calls.bucket           hydrate.js:197  _bucket: r.bucket
--                          hydrate.js:118-121  splits every call into the four
--                                          seed arrays (missed / connected /
--                                          ivr / history) — the ONLY thing that
--                                          routes a call to a screen
--                          hydrate.js:252  r.bucket === 'history' → out.kind
--                          → LOAD-BEARING. Dropping it empties every call list.
--                            Replacement (not done here, needs a client change):
--                            derive it — 'today' = at >= date_trunc('day', now())
--                            — in hydrate.js, then drop the column. That is the
--                            fix; it is a code change, not a migration.
--
--   calls.time_label       hydrate.js:202 → out.time, rendered by
--                          data/calls.js:215,223 (missed + IVR cards)
--   calls.minutes_ago      hydrate.js:203 → out.minutesAgo, read by
--                          data/calls.js:216,224
--   stores.added_ago       hydrate.js:353-354 → out.addedAgo / addedAgoKey
--   customers.first_seen_label
--                          hydrate.js:269 → out.firstSeen
--   (customers.last_seen_label — hydrate.js:271 — is in the same family and the
--    0001 header already notes the AI-prompt builder reads it.)
--
-- So: NOTHING IS DROPPED IN THIS MIGRATION. The columns are marked deprecated
-- instead, so the next reader knows the timestamp beside them is the truth and
-- the string is a frozen copy that ages.
-- ============================================================
comment on column calls.bucket is
  'DEPRECATED (rots): a time-relative fact frozen at seed time — a row seeded as ''today'' is still ''today'' next month. Derive from calls.at instead. Cannot be dropped until packages/core/data/hydrate.js:118-121,197,252 stops routing on it.';
comment on column calls.time_label is
  'DEPRECATED display string, frozen at seed time. calls.at is the truth. Read by hydrate.js:202 → data/calls.js:215,223.';
comment on column calls.minutes_ago is
  'DEPRECATED display offset, frozen at seed time. calls.at is the truth. Read by hydrate.js:203 → data/calls.js:216,224.';
comment on column stores.added_ago is
  'DEPRECATED display string, frozen at seed time. stores.added_at is the truth. Read by hydrate.js:353.';
comment on column customers.first_seen_label is
  'DEPRECATED display string, frozen at seed time. customers.first_seen_at is the truth. Read by hydrate.js:269.';
comment on column customers.last_seen_label is
  'DEPRECATED display string, frozen at seed time. customers.last_seen_at is the truth. Read by hydrate.js:271 and the AI prompt builder.';

commit;
