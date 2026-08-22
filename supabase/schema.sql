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
