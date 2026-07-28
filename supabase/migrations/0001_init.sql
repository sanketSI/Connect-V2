-- ============================================================
-- TS-Connect — initial relational schema (Supabase / Postgres)
--
-- Mirrors what the app ACTUALLY consumes today through the src/data boundary
-- (src/lib/seedData.js is the current adapter; src/data/hydrate.js maps these
-- tables back onto the exact record shapes the screens read at module scope).
--
-- Naming: snake_case here, camelCase in the app — hydrate.js owns the mapping.
-- Every user-visible prose field keeps its `*_key` i18n sibling column: the
-- translations pipeline renders t(key, { defaultValue: english }) at runtime,
-- so BOTH travel together or the catalog keys get dropped and English leaks in.
--
-- DELIBERATELY NOT TABLES (still seed-only, the app treats them as static
-- reference/demo data): CLUSTER_STORES / CITY_STORES / REGIONAL_CITIES
-- (hierarchy roll-ups), REVIEW_LEADERBOARD stats, BUSINESS_PROFILE, GBP_FIELDS,
-- CATEGORY_OPTIONS / ATTRIBUTE_GROUPS, UPLOAD_SAMPLES, COMPETITOR_BRANDS,
-- NON_BRAND_NAME_SIGNALS, LANGUAGES, ROLES, SOURCES.
--
-- DELIBERATELY OMITTED COLUMNS (derived, per the codebase's one-source-of-truth
-- rule):
--   reviews.responded / reviews.sentiment / reviews.ai_reply — computed from
--     `review_replies` and `rating` in src/data/reviews.js (resolveReview()).
--     A stored copy would drift from the replies the moment one is deleted.
--   media_assets.ok — the seed REMOVED this flag on purpose: whether an image
--     is compliant is answered by checkCompliance() in src/data/content.js
--     every time it is asked, never read off a stored verdict.
-- ============================================================

-- ------------------------------------------------------------
-- dealers — one login phone number that owns one or more stores.
-- Seed: the primary demo dealer plus the two foreign owners implied by the
-- store-code registry (a code that resolves but is NOT yours is what makes the
-- login's "notMapped" rejection real — see src/data/session.js).
-- ------------------------------------------------------------
create table dealers (
  id         text primary key,
  phone      text not null unique,          -- raw 10-digit login number
  name       text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- stores — one physical outlet. store_code is the login/registry identity
-- ('LKS-IND-01'); dealer_id + dealers.phone reconstruct STORE_CODE_REGISTRY.
--
-- DENORMALIZED, on purpose (prototype posture): missed_count / answered_count /
-- recovered_count / recovery_pct / health / health_prev / rating / reviews_count
-- are the card stats the store-selector UI shows. A real backend would roll
-- these up from `calls` and `reviews`; here they are seeded facts.
-- ------------------------------------------------------------
create table stores (
  id              text primary key,          -- app location id, e.g. 'lks-ind'
  dealer_id       text not null references dealers(id),
  store_code      text not null unique,      -- e.g. 'LKS-IND-01'
  seq             int  not null default 0,   -- seed ordering (array order in the app)
  name            text not null,
  branch          text,
  city            text,
  address         text,
  pincode         text,
  state           text,
  landmark        text,
  stated_lat      double precision,          -- where the listing SAYS the store is
  stated_lng      double precision,
  actual_lat      double precision,          -- where it actually is (drift check)
  actual_lng      double precision,
  rating          numeric(2,1),
  reviews_count   int,
  verified        boolean not null default false,
  verified_at     timestamptz,
  missed_count    int,                       -- denormalized card stats (see header)
  answered_count  int,
  recovered_count int,
  recovery_pct    int,
  health          int,
  health_prev     int,
  is_primary      boolean not null default false,  -- 'primary' is reserved; hydrate maps it back
  added_ago       text,                      -- legacy display string ('Added 2 weeks ago')
  added_ago_key   text,
  added_at        timestamptz,
  created_at      timestamptz not null default now()
);

-- ------------------------------------------------------------
-- managers — the people on a dealer's team (PRIMARY_USER + the leaderboard
-- names). phone is stored exactly as the seed holds it — the masked display
-- form; the app never holds a manager's raw number.
-- ------------------------------------------------------------
create table managers (
  id         text primary key,
  dealer_id  text not null references dealers(id),
  name       text not null,
  initials   text,
  role       text,
  phone      text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- customers — the mini-CRM. name is NULL for anonymous ad-callers (a real
-- unknown, not a missing value). phone is the raw dialable number; the masked
-- display form is DERIVED client-side (maskCustomer in hydrate.js) so it can
-- never drift from the number it claims to mask.
-- cli = "chance to buy" score 0–100.
-- ------------------------------------------------------------
create table customers (
  id               text primary key,
  store_id         text not null references stores(id),
  seq              int  not null default 0,
  name             text,                    -- null = anonymous caller
  phone            text,
  cli              int check (cli between 0 and 100),
  band             text check (band in ('hot','warm','cold')),
  value            int,                     -- estimated pipeline value (₹)
  category         text,
  category_key     text,
  ai_guess         text,
  ai_guess_key     text,
  first_seen_label text,                    -- legacy frozen display ('Today · 9:34 AM')
  first_seen_at    timestamptz,
  last_seen_label  text,                    -- still read by the AI-prompt builder
  last_seen_at     timestamptz,
  call_count       int not null default 0,
  review_sent      boolean not null default false,
  reviewed         boolean not null default false,
  created_at       timestamptz not null default now()
);

-- Per-customer activity timeline (rendered on the customer sheet).
create table customer_timeline_events (
  id           bigint generated always as identity primary key,
  customer_id  text not null references customers(id) on delete cascade,
  seq          int  not null default 0,
  type         text not null check (type in ('missed','inbound','outbound','review-sent','review-landed')),
  at_label     text,                        -- legacy frozen display ('9:34 AM today')
  at           timestamptz not null,
  at_precision text check (at_precision in ('relative')),  -- null = wall-clock render
  detail       text,
  detail_key   text,
  created_at   timestamptz not null default now()
);

-- What the manager typed against a customer — verbatim, never translated.
create table customer_notes (
  id          text primary key,             -- app-generated ('nt-…')
  customer_id text not null references customers(id) on delete cascade,
  author      text,
  body        text not null,                -- app field name: `text`
  at          timestamptz not null,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- calls — the unified call log.
--
-- bucket keeps the seed's load-bearing split: 'today' rows feed the live
-- MISSED_CALLS / CONNECTED_CALLS / IVR_DROPS arrays ("today's calls" screens),
-- 'history' rows feed CALL_HISTORY (the windowed selectors). outcome is the
-- three-way truth: 'missed', 'answered', 'ivr_drop' (hung up inside the IVR —
-- still missed by any honest reading, see src/data/calls.js).
--
-- customer_id is a nullable FK. Six seed missed-calls reference CRM ids the
-- seed never defined (cust-912/446/103/770/318/602); the generator NULLs them —
-- behaviorally identical, since getCustomerById() already resolved them to null.
--
-- repeat_history_at / repeat_history_labels are denormalized display arrays
-- (2–3 stamps a card shows), not a join table — prototype posture, noted.
-- ------------------------------------------------------------
create table calls (
  id                    text primary key,
  store_id              text not null references stores(id),
  customer_id           text references customers(id),
  seq                   int  not null default 0,
  bucket                text not null check (bucket in ('today','history')),
  outcome               text not null check (outcome in ('missed','answered','ivr_drop')),
  spam                  boolean not null default false,
  at                    timestamptz not null,
  masked                text,               -- '+91 •••••231'
  full_masked_display   text,               -- '+91 ●●●●● ●●231' (missed cards)
  time_label            text,               -- legacy frozen display ('11:48 AM')
  minutes_ago           int,                -- legacy frozen display offset
  source                text,               -- SOURCES key ('SingleInterface', 'Google', …)
  duration              text,               -- display string ('4m 32s')
  direction             text check (direction in ('inbound','outbound')),
  cli                   int check (cli between 0 and 100),
  est_value             int,
  category              text,
  category_key          text,
  intent                text check (intent in ('high','medium','low')),
  intent_reason         text,
  intent_reason_key     text,
  repeats               int,
  repeat_history_labels text[],
  repeat_history_at     timestamptz[],
  sentiment             text not null default 'neutral' check (sentiment in ('positive','negative','neutral')),
  mood                  text,
  call_reason           text,               -- CALL_REASONS closed set (identity = English value)
  call_reason_key       text,
  lead_status           text not null default 'open' check (lead_status in ('open','converted','lost')),
  review_link_sent      boolean not null default false,
  summary               text,
  summary_key           text,
  highlights            text[],
  next_step             text,
  next_step_label       text,
  next_step_label_key   text,
  tag                   text,
  -- IVR-drop stage fields (only on outcome = 'ivr_drop')
  ivr_stage             text,
  ivr_stage_key         text,
  ivr_dropped_at_label  text,               -- 'After 8s'
  ivr_dropped_at_key    text,
  ivr_dropped_after_sec int,
  ivr_drop_reason       text,               -- why they DROPPED (app field: `reason`)
  ivr_drop_reason_key   text,
  created_at            timestamptz not null default now()
);

-- Transcript of an ANSWERED call, one row per turn. at_offset_ms is the turn's
-- position INTO the call (calls.at + at_offset_ms = the turn's instant) — a
-- stable fact about the conversation that never ages, unlike an absolute stamp.
create table call_transcript_turns (
  id           bigint generated always as identity primary key,
  call_id      text not null references calls(id) on delete cascade,
  turn_index   int  not null,
  speaker      text not null check (speaker in ('customer','manager')),
  body         text not null,               -- app field name: `text`
  at_offset_ms int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (call_id, turn_index)
);

-- ------------------------------------------------------------
-- reviews — the listing inbox. customer_id is a CLAIM, set only where the
-- evidence survives questioning (2 of 21 in the seed) — never inferred from a
-- name. body NULL = star-only review. responded/sentiment are NOT stored
-- (derived — see the header).
-- ------------------------------------------------------------
create table reviews (
  id                  text primary key,
  store_id            text not null references stores(id),
  customer_id         text references customers(id),
  seq                 int  not null default 0,
  author_name         text not null,        -- app field: `customer` (display name)
  rating              int  not null check (rating between 1 and 5),
  body                text,                 -- null = rating without text
  platform            text not null,        -- 'Google' | 'Justdial' | …
  at                  timestamptz not null,
  time_label          text,                 -- legacy frozen display ('2h ago')
  priority            boolean not null default false,
  removed_from_google boolean not null default false,
  removed_at          timestamptz,
  edited              boolean not null default false,
  edited_at           timestamptz,
  previous_rating     int check (previous_rating between 1 and 5),
  tags                text[] not null default '{}',  -- REVIEW_TAGS ids (closed catalog; denormalized on purpose)
  created_at          timestamptz not null default now()
);

-- Reply HISTORY, including replies later deleted (deleted=true stays visible
-- as history; `responded` in the app counts only live ones).
create table review_replies (
  id         text primary key,
  review_id  text not null references reviews(id) on delete cascade,
  platform   text not null,                 -- PUBLISHING_PLATFORMS id: 'gbp' | 'justdial' | 'facebook'
  body       text not null,                 -- app field name: `text`
  author     text,
  at         timestamptz not null,
  deleted    boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- media_assets — the pictures on a location's listing. label_key NULL means
-- the label is a raw FILE NAME and must render verbatim in every language.
-- src NULL = we hold no pixels for it (the seed's placeholder tiles).
-- NO `ok` column — see the header for why the compliance verdict is derived.
-- ------------------------------------------------------------
create table media_assets (
  id         text primary key,
  store_id   text not null references stores(id),
  seq        int  not null default 0,
  kind       text not null check (kind in ('cover','photo')),
  label      text not null,
  label_key  text,                          -- null => label is a file name
  tag        text,
  tag_key    text,
  src        text,                          -- image URL when we actually hold one
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- post_templates — the four Nova post types the composer offers.
-- ------------------------------------------------------------
create table post_templates (
  id           text primary key,            -- 'pt-standard', …
  seq          int  not null default 0,
  type         text not null check (type in ('standard','offer','event','testimonial')),
  name         text not null,
  name_key     text,
  icon         text,                        -- lucide icon name resolved by the composer
  accent       text,                        -- hex accent color
  headline     text,
  headline_key text,
  cta          text,
  cta_key      text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- access_requests — "map this store to my number" requests from the login
-- sheet (store code + the number on file + the number asking + why). Written
-- by unauthenticated users by design — that is the whole point of the flow.
-- Seeded empty. (No app mutator writes it yet; the table + INSERT policy are
-- the landing zone for wiring the login sheet's onRequestNumberChange.)
-- ------------------------------------------------------------
create table access_requests (
  id            bigint generated always as identity primary key,
  store_code    text not null references stores(store_code),
  current_phone text,                       -- the number currently on file
  new_phone     text not null,              -- the number requesting access
  reason        text,                       -- 'joined' | 'changed' | 'multi' (login sheet's closed set)
  status        text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at    timestamptz not null default now()
);

-- ============================================================
-- INDEXES — every FK and every timestamp column.
-- ============================================================
create index idx_stores_dealer_id            on stores (dealer_id);
create index idx_stores_verified_at          on stores (verified_at);
create index idx_stores_added_at             on stores (added_at);
create index idx_stores_created_at           on stores (created_at);
create index idx_dealers_created_at          on dealers (created_at);
create index idx_managers_dealer_id          on managers (dealer_id);
create index idx_managers_created_at         on managers (created_at);
create index idx_customers_store_id          on customers (store_id);
create index idx_customers_first_seen_at     on customers (first_seen_at);
create index idx_customers_last_seen_at      on customers (last_seen_at);
create index idx_customers_created_at        on customers (created_at);
create index idx_cte_customer_id             on customer_timeline_events (customer_id);
create index idx_cte_at                      on customer_timeline_events (at);
create index idx_cte_created_at              on customer_timeline_events (created_at);
create index idx_customer_notes_customer_id  on customer_notes (customer_id);
create index idx_customer_notes_at           on customer_notes (at);
create index idx_customer_notes_created_at   on customer_notes (created_at);
create index idx_calls_store_id              on calls (store_id);
create index idx_calls_customer_id           on calls (customer_id);
create index idx_calls_at                    on calls (at);
create index idx_calls_created_at            on calls (created_at);
create index idx_ctt_call_id                 on call_transcript_turns (call_id);
create index idx_ctt_created_at              on call_transcript_turns (created_at);
create index idx_reviews_store_id            on reviews (store_id);
create index idx_reviews_customer_id         on reviews (customer_id);
create index idx_reviews_at                  on reviews (at);
create index idx_reviews_removed_at          on reviews (removed_at);
create index idx_reviews_edited_at           on reviews (edited_at);
create index idx_reviews_created_at          on reviews (created_at);
create index idx_review_replies_review_id    on review_replies (review_id);
create index idx_review_replies_at           on review_replies (at);
create index idx_review_replies_deleted_at   on review_replies (deleted_at);
create index idx_review_replies_created_at   on review_replies (created_at);
create index idx_media_assets_store_id       on media_assets (store_id);
create index idx_media_assets_created_at     on media_assets (created_at);
create index idx_post_templates_created_at   on post_templates (created_at);
create index idx_access_requests_store_code  on access_requests (store_code);
create index idx_access_requests_created_at  on access_requests (created_at);

-- ============================================================
-- ROW LEVEL SECURITY
--
-- ############################################################
-- ##  DEMO POSTURE — READ THIS BEFORE SHIPPING ANYTHING     ##
-- ############################################################
-- The app currently has NO auth: it runs entirely on the anon key that ships
-- in the client bundle. So these policies let the anon role:
--   • SELECT every table                     (the app is read-mostly)
--   • INSERT customer_notes, access_requests (notes composer / access sheet)
--   • UPDATE calls  (lead_status, review_link_sent mutators)
--   • UPDATE stores (verifyLocation writes verified + corrected address/geo)
--
-- That means ANYONE with the URL + anon key can read and write those rows.
-- Acceptable for a seeded demo dataset; NOT acceptable with real data.
--
-- TO REVOKE THE WRITE SURFACE (keep read-only demo):
--   drop policy calls_anon_update  on calls;
--   drop policy stores_anon_update on stores;
--   drop policy customer_notes_anon_insert  on customer_notes;
--   drop policy access_requests_anon_insert on access_requests;
--
-- TO GO FULLY PRIVATE (auth'd users only), also drop every *_anon_select
-- policy below and replace with policies keyed to auth.uid() / a dealer claim.
-- RLS stays ENABLED on every table either way — dropping a policy closes the
-- door; it never opens one.
-- ============================================================
alter table dealers                  enable row level security;
alter table stores                   enable row level security;
alter table managers                 enable row level security;
alter table customers                enable row level security;
alter table customer_timeline_events enable row level security;
alter table customer_notes           enable row level security;
alter table calls                    enable row level security;
alter table call_transcript_turns    enable row level security;
alter table reviews                  enable row level security;
alter table review_replies           enable row level security;
alter table media_assets             enable row level security;
alter table post_templates           enable row level security;
alter table access_requests          enable row level security;

create policy dealers_anon_select                  on dealers                  for select to anon, authenticated using (true);
create policy stores_anon_select                   on stores                   for select to anon, authenticated using (true);
create policy managers_anon_select                 on managers                 for select to anon, authenticated using (true);
create policy customers_anon_select                on customers                for select to anon, authenticated using (true);
create policy customer_timeline_events_anon_select on customer_timeline_events for select to anon, authenticated using (true);
create policy customer_notes_anon_select           on customer_notes           for select to anon, authenticated using (true);
create policy calls_anon_select                    on calls                    for select to anon, authenticated using (true);
create policy call_transcript_turns_anon_select    on call_transcript_turns    for select to anon, authenticated using (true);
create policy reviews_anon_select                  on reviews                  for select to anon, authenticated using (true);
create policy review_replies_anon_select           on review_replies           for select to anon, authenticated using (true);
create policy media_assets_anon_select             on media_assets             for select to anon, authenticated using (true);
create policy post_templates_anon_select           on post_templates           for select to anon, authenticated using (true);
create policy access_requests_anon_select          on access_requests          for select to anon, authenticated using (true);

-- DEMO WRITES (see the loud header above for exactly what these expose and
-- the drop statements that revoke them).
create policy customer_notes_anon_insert  on customer_notes  for insert to anon, authenticated with check (true);
create policy access_requests_anon_insert on access_requests for insert to anon, authenticated with check (true);
create policy calls_anon_update           on calls           for update to anon, authenticated using (true) with check (true);
create policy stores_anon_update          on stores          for update to anon, authenticated using (true) with check (true);
