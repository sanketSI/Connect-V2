-- ============================================================
-- 0005 — MVP: the lead lifecycle, lead sources, and store assignments.
--
-- THREE THINGS, one of which was already broken before the MVP asked for anything.
--
-- 1. calls.lead_status was CHECKED against ('open','converted','lost') while the app had
--    already moved to open|converted|expired. A live write of 'expired' would have been
--    rejected by the database — the seed-mode app never noticed because it mutates in
--    memory. The MVP replaces the vocabulary anyway, so the drift is fixed by doing so.
--
-- 2. Leads arrive from three sources (call, form, walk-in). Only calls had a table.
--
-- 3. "The stores my brand admin assigned me" had no model at all: managers link to a
--    DEALER, not to stores. Every store was visible because the fixture handed over
--    every store.
--
-- Additive and idempotent. Existing rows are migrated in place, not dropped.
-- ============================================================
begin;

-- ------------------------------------------------------------
-- 1. THE FIVE-STATE LIFECYCLE
--
-- Old → new, matching the app's own derivation in leads.js so the database and the
-- client agree about a row that neither has touched since:
--   'lost'                       → 'expired'   (the rename that already happened in-app)
--   'converted' + review sent    → 'review_requested'
--   'open' on an ANSWERED call   → 'contacted' (it was contacted when it was answered)
--   'open' on a missed call      → 'missed'
--
-- NB the column's own vocabulary is ('missed','answered','ivr_drop') — 'answered', not
-- the app's 'attended'. An ivr_drop is a caller who hung up inside the phone menu, so it
-- was never contacted and correctly falls through to 'missed'.
-- ------------------------------------------------------------
alter table calls drop constraint if exists calls_lead_status_check;

update calls set lead_status = 'expired'          where lead_status = 'lost';
update calls set lead_status = 'review_requested' where lead_status = 'converted' and coalesce(review_link_sent, false);
update calls set lead_status = 'contacted'        where lead_status = 'open' and outcome = 'answered';
update calls set lead_status = 'missed'           where lead_status = 'open';

alter table calls
  add constraint calls_lead_status_check
  check (lead_status in ('missed','contacted','converted','review_requested','expired'));

alter table calls alter column lead_status set default 'missed';

-- ------------------------------------------------------------
-- 2. LEAD SOURCE
--
-- On customers, because that is where a form or walk-in lead lives — a call already
-- carries its source by existing in the calls table. Defaulted to 'call' so every
-- existing row keeps the meaning it already had.
-- ------------------------------------------------------------
alter table customers
  add column if not exists lead_source text not null default 'call'
    check (lead_source in ('call','form','walk_in'));

-- A form or walk-in lead has its own place in the lifecycle, independent of any call.
alter table customers
  add column if not exists lead_status text
    check (lead_status is null or lead_status in ('missed','contacted','converted','review_requested','expired'));

comment on column customers.lead_source is
  'Where the lead came from. Calls are implicit; this names the ones that are not.';
comment on column customers.lead_status is
  'Set only for form/walk-in leads. NULL for call-sourced customers, whose status lives on the call.';

-- ------------------------------------------------------------
-- 3. ASSIGNMENTS — which stores a manager was granted, and at what level.
--
-- `scope` is how a brand admin grants breadth without listing every shop:
--   'store' — this store
--   'city'  — every store in scope_value, that city
--   'state' — every store in scope_value, that state
--   'brand' — the whole dealer
-- store_id is set only for scope='store'; scope_value only for city/state. The check
-- keeps the two from disagreeing, which is the failure mode of a nullable-columns
-- design: a row that names both a store and a state and cannot say which it means.
-- ------------------------------------------------------------
create table if not exists manager_store_assignments (
  id          bigserial primary key,
  manager_id  text not null references managers(id) on delete cascade,
  scope       text not null check (scope in ('store','city','state','brand')),
  store_id    text references stores(id) on delete cascade,
  scope_value text,
  created_at  timestamptz not null default now(),

  constraint assignment_scope_shape check (
    (scope = 'store' and store_id is not null and scope_value is null) or
    (scope in ('city','state') and store_id is null and scope_value is not null) or
    (scope = 'brand' and store_id is null and scope_value is null)
  )
);

create unique index if not exists manager_store_assignments_unique
  on manager_store_assignments (manager_id, scope, coalesce(store_id, ''), coalesce(scope_value, ''));

create index if not exists manager_store_assignments_manager
  on manager_store_assignments (manager_id);

comment on table manager_store_assignments is
  'What NOVA user management granted a manager. Drives both which stores they can open '
  'and the depth of the multi-location roll-up (one city → store, one state → city → '
  'store, several states → state → city → store).';

-- Seed parity: the demo manager holds the whole dealer, which is MANAGER_ASSIGNMENTS
-- = ['*'] in the app fixture.
insert into manager_store_assignments (manager_id, scope)
select m.id, 'brand' from managers m
on conflict do nothing;

-- ------------------------------------------------------------
-- Grants, matching 0002's column-level policy: the app reads these, never writes them.
-- ------------------------------------------------------------
grant select on manager_store_assignments to anon, authenticated;

commit;
