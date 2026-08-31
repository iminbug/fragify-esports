-- Fragify Esports — run this in the Supabase SQL editor BEFORE deploying.
-- Adds optional squad members + database-level duplicate protection.

-- 1) Optional squad member IGNs (leader is stored separately in leader_name).
alter table registrations
  add column if not exists members jsonb not null default '[]'::jsonb;

-- 2) One registration per phone number.
--    Run the SELECT first: if it returns rows, clean those up before the index.
--    select phone, count(*) from registrations group by phone having count(*) > 1;
create unique index if not exists registrations_phone_key
  on registrations (phone);

-- 3) One registration per team name, case- and spacing-insensitive
--    ("Team  Phantom" and "team phantom" collide).
--    select lower(regexp_replace(btrim(team_name), '\s+', ' ', 'g')) as n, count(*)
--      from registrations group by n having count(*) > 1;
create unique index if not exists registrations_team_name_key
  on registrations (lower(regexp_replace(btrim(team_name), '\s+', ' ', 'g')));
