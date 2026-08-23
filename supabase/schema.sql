-- KINGDOM — the vault table.
--
-- One row per Solana address. Written ONLY by the serverless function in
-- /api, which holds the service-role key and verifies an ed25519 signature
-- before it touches a row. Row level security is on with no policies at all,
-- which means the anon key — the one that ships to browsers — can neither
-- read nor write. That is deliberate: the anon key is public.

create table if not exists public.vaults (
  address     text primary key,
  groats      integer     not null default 0 check (groats >= 0),
  lifetime    integer     not null default 0 check (lifetime >= 0),
  charters    jsonb       not null default '[]'::jsonb,
  best_pop    integer     not null default 0 check (best_pop >= 0),
  updated_at  timestamptz not null default now()
);

alter table public.vaults enable row level security;
-- no policies on purpose: everything goes through the service role in /api

create index if not exists vaults_lifetime_idx on public.vaults (lifetime desc);

-- What this table is NOT: an anti-cheat. The game simulates in the browser, so
-- a determined player can post any balance for an address they control. The
-- signature stops one player writing to ANOTHER player's row, which is the part
-- that matters for a shared board. Balances become trustworthy only when the
-- chain re-simulates the plan — that is the whole point of the Anchor program
-- in research/14-spec-steading.md, and it is not built yet.

-- The competition. One row per wallet per valley, holding that wallet's best
-- reign on that island.
--
-- `score` is never taken from the client. /api/run replays the submitted record
-- through web/rules.js — the same file the browser played by — and works the
-- score out itself, which is the only reason a prize can hang off this table.
create table if not exists public.runs (
  seed         text        not null,
  address      text        not null,
  score        bigint      not null default 0,
  peak_pop     integer     not null default 0,
  gold         bigint      not null default 0,
  days         integer     not null default 0,
  acts         integer     not null default 0,
  submitted_at timestamptz not null default now(),
  primary key (seed, address)
);

alter table public.runs enable row level security;
-- no policies, same as vaults: the anon key is public, so it gets nothing

create index if not exists runs_board_idx on public.runs (seed, score desc);

-- ---------------------------------------------------------------------------
-- Groats become real money the moment they buy anything worth having, so they
-- stop being something a browser can declare.
--
-- A wallet that had never played could POST a billion groats and every charter
-- to /api/vault and the row would take it — which was fine while groats only
-- bought head starts in a single-player game, and is a printing press the
-- moment they are worth a token. These columns are written ONLY by /api/run,
-- from a reign the server replayed itself, and spent ONLY by /api/market.
alter table public.vaults add column if not exists minted bigint not null default 0;
alter table public.vaults add column if not exists spent  bigint not null default 0;
alter table public.vaults add column if not exists owned  jsonb  not null default '[]'::jsonb;
alter table public.vaults add constraint vaults_spent_le_minted check (spent <= minted) not valid;

-- what a single verified reign minted, so resubmitting the same season cannot
-- mint twice — only an improvement mints the difference
alter table public.runs add column if not exists minted bigint not null default 0;

-- ---------------------------------------------------------------------------
-- What was actually sent, and the transaction that sent it.
--
-- The server has no key and cannot move a coin. A human reads the payout list,
-- sends from their own wallet, and records the signature here — so the claim
-- "the season was paid" is backed by something anyone can look up on chain
-- rather than by this project's word. Written only by /api/payout, behind
-- PAYOUT_SECRET; RLS on with no policies, same as everything else.
create table if not exists public.payouts (
  seed    text        not null,
  address text        not null,
  asset   text        not null default 'sol',
  amount  text        not null default '0',   -- base units, exact, never a float
  place   integer     not null default 0,
  tx      text        not null default '',
  paid_at timestamptz not null default now(),
  primary key (seed, address)
);

alter table public.payouts enable row level security;

create index if not exists payouts_seed_idx on public.payouts (seed, place);

-- DELVE — the daily board. One row per (day, name): that name's best run of
-- the day. `score`, `depth`, `out` and the death tile are never taken from the
-- client — /api/delve-run replays the submitted record through delve/rules.js
-- and writes what the replay says. `acts` keeps the record itself, so any row
-- can be re-verified forever.
--
-- Names are not wallets: this board is a campfire, not a bank. The replay
-- stops impossible scores; it cannot stop a player calling themselves two
-- names. That is acceptable for a daily dungeon and a row of bones.
create table if not exists public.delve_runs (
  day         text        not null check (day ~ '^\d{4}-\d{2}-\d{2}$'),
  name        text        not null check (char_length(name) between 2 and 24),
  score       bigint      not null default 0 check (score >= 0),
  depth       integer     not null default 0 check (depth between 0 and 32),
  out         boolean     not null default false,
  felled      integer     not null default 0 check (felled >= 0),
  turns       integer     not null default 0 check (turns >= 0),
  died_depth  integer,
  died_x      integer,
  died_y      integer,
  gear        jsonb       not null default 'null'::jsonb,
  acts        jsonb       not null,
  created_at  timestamptz not null default now(),
  primary key (day, name)
);

alter table public.delve_runs enable row level security;
-- no policies on purpose: everything goes through the service role in /api

create index if not exists delve_runs_day_score_idx on public.delve_runs (day, score desc);

-- The best-run rule, enforced where it cannot race: two submissions for the
-- same (day, name) may both pass the API's read-then-compare, but this trigger
-- makes the row itself refuse to get worse. The API's check remains as the
-- polite early answer; this is the lock on the door.
create or replace function public.delve_keep_best() returns trigger as $$
begin
  if new.score <= old.score then
    return null;   -- the standing run is better or equal: the write is dropped
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists delve_runs_keep_best on public.delve_runs;
create trigger delve_runs_keep_best
  before update on public.delve_runs
  for each row execute function public.delve_keep_best();
