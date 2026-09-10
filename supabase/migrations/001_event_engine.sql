-- EARNINGS. v0.9 event/reaction backbone
-- Run in Supabase SQL editor (or apply via Supabase migration tooling).

create extension if not exists pgcrypto;

create table if not exists public.earnings_events (
  id uuid primary key default gen_random_uuid(),
  market integer not null,
  ticker text not null,
  company text,
  event_label text,
  event_time timestamptz not null,
  lock_time timestamptz not null,
  status text not null default 'OPEN' check (status in ('OPEN','LOCKED','PRINTED','FINAL')),
  eps_est numeric,
  revenue_est numeric,
  eps_actual numeric,
  revenue_actual numeric,
  verdict text check (verdict in ('BEAT','MISS','INLINE')),
  implied_move_pct numeric,
  crowd_beat_pct integer,
  crowd_miss_pct integer,
  crowd_calls integer,
  source_url text,
  source_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (market, ticker)
);

create table if not exists public.reaction_snapshots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.earnings_events(id) on delete cascade,
  checkpoint text not null check (checkpoint in ('T+5M','T+15M','T+60M','AH_CLOSE','NEXT_CLOSE','MANUAL')),
  observed_at timestamptz not null,
  close_price numeric,
  observed_price numeric,
  realized_move_pct numeric not null,
  implied_move_pct numeric,
  classification text,
  source_url text,
  source_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, checkpoint)
);

create index if not exists earnings_events_market_idx on public.earnings_events(market);
create index if not exists reaction_snapshots_event_idx on public.reaction_snapshots(event_id, observed_at desc);

alter table public.earnings_events enable row level security;
alter table public.reaction_snapshots enable row level security;

drop policy if exists "public read earnings events" on public.earnings_events;
create policy "public read earnings events"
on public.earnings_events for select to anon using (true);

drop policy if exists "public read reaction snapshots" on public.reaction_snapshots;
create policy "public read reaction snapshots"
on public.reaction_snapshots for select to anon using (true);

grant select on public.earnings_events to anon, authenticated;
grant select on public.reaction_snapshots to anon, authenticated;

-- Canonical Market 002 seed. Values can later be updated by an authenticated backend/Edge Function.
insert into public.earnings_events
(market,ticker,company,event_label,event_time,lock_time,status,eps_est,revenue_est,eps_actual,revenue_actual,verdict,implied_move_pct,crowd_beat_pct,crowd_miss_pct,crowd_calls,source_verified)
values
(2,'ORCL','Oracle','Q1 FY27','2026-09-10T20:00:00Z','2026-09-10T20:00:00Z','PRINTED',1.74,19.06,1.92,19.30,'BEAT',10.1,86,14,7,true),
(2,'ADBE','Adobe','Q3 FY26','2026-09-10T20:00:00Z','2026-09-10T20:00:00Z','PRINTED',6.08,6.69,6.13,6.76,'BEAT',8.0,38,62,8,true)
on conflict (market,ticker) do update set
  event_label=excluded.event_label,
  event_time=excluded.event_time,
  lock_time=excluded.lock_time,
  status=excluded.status,
  eps_est=excluded.eps_est,
  revenue_est=excluded.revenue_est,
  eps_actual=excluded.eps_actual,
  revenue_actual=excluded.revenue_actual,
  verdict=excluded.verdict,
  implied_move_pct=excluded.implied_move_pct,
  crowd_beat_pct=excluded.crowd_beat_pct,
  crowd_miss_pct=excluded.crowd_miss_pct,
  crowd_calls=excluded.crowd_calls,
  source_verified=excluded.source_verified,
  updated_at=now();

insert into public.reaction_snapshots
(event_id,checkpoint,observed_at,realized_move_pct,implied_move_pct,classification,source_verified)
select id,'MANUAL','2026-09-10T20:57:00Z',7.0,10.1,'BEAT · REACTION BELOW IMPLIED',true
from public.earnings_events where market=2 and ticker='ORCL'
on conflict (event_id,checkpoint) do update set
  observed_at=excluded.observed_at,
  realized_move_pct=excluded.realized_move_pct,
  implied_move_pct=excluded.implied_move_pct,
  classification=excluded.classification,
  source_verified=excluded.source_verified;

insert into public.reaction_snapshots
(event_id,checkpoint,observed_at,realized_move_pct,implied_move_pct,classification,source_verified)
select id,'MANUAL','2026-09-10T20:57:00Z',-1.8,8.0,'BEAT · NEGATIVE REACTION',true
from public.earnings_events where market=2 and ticker='ADBE'
on conflict (event_id,checkpoint) do update set
  observed_at=excluded.observed_at,
  realized_move_pct=excluded.realized_move_pct,
  implied_move_pct=excluded.implied_move_pct,
  classification=excluded.classification,
  source_verified=excluded.source_verified;
