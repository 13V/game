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
