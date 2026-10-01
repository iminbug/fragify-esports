import { kv } from "@vercel/kv";
import { matchKeys } from "./matches.js";
import { sessionFromRequest } from "./session.js";

/* Shared by the room and payment endpoints: both hand a team its own data only after
   it proves it holds the Team ID and password issued at registration.

   Lives outside api/ on purpose — every .js file inside api/ is turned into a route by
   Vercel, and this module has no request handler to expose. */

/* A wrong password is cheap to retry over HTTP, so cap the guesses per team. */
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SECONDS = 300;

/* "FRG-M1-006" -> { matchId: "M1", slot: 6 }. Anything else is not a Team ID we ever
   issued. The match id sits inside the Team ID because slot numbers repeat across
   matches — slot #06 exists in every lobby, so the number alone identifies nobody. */
export function parseTeamId(raw) {
  const match = /^FRG-(M\d{1,4})-(\d{1,4})$/i.exec(String(raw ?? "").trim());
  return match ? { matchId: match[1].toUpperCase(), slot: Number(match[2]) } : null;
}

/* Compare in constant time so response timing can't leak how much of the password
   was right. */
export function sameSecret(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* Registrations are written both to a per-slot key and into the match's list. Fall
   back to the list rather than telling an already-registered team their ID is wrong. */
export async function findRegistration(matchId, slot) {
  const direct = await kv.get(matchKeys.slot(matchId, slot));
  if (direct) return direct;

  const list = await kv.get(matchKeys.list(matchId));
  if (!Array.isArray(list)) return null;
  return list.find((r) => Number(r?.slot_number) === slot) || null;
}

/* Returns { registration, matchId, slot } on success, or { status, error } ready to
   send back to the caller unchanged. */
export async function authenticateTeam(teamId, password) {
  const parsed = parseTeamId(teamId);
  if (!parsed) return { status: 400, error: "Team ID looks like FRG-M1-006" };
  const { matchId, slot } = parsed;

  const attemptsKey = `team:attempts:${matchId}:${slot}`;
  const attempts = await kv.incr(attemptsKey);
  if (attempts === 1) await kv.expire(attemptsKey, ATTEMPT_WINDOW_SECONDS);
  if (attempts > MAX_ATTEMPTS) {
    return { status: 429, error: "Too many tries. Wait 5 minutes." };
  }

  const registration = await findRegistration(matchId, slot);
  const given = String(password ?? "").trim().toUpperCase();
  if (!registration || !sameSecret(registration.password, given)) {
    return { status: 401, error: "Team ID or password is incorrect" };
  }

  // A correct login clears the counter so a team that fat-fingered it once isn't
  // locked out later.
  await kv.del(attemptsKey);
  return { registration, matchId, slot };
}

/* Preferred path for every captain-facing endpoint: proves ownership with the
   signed-in Google account instead of a password. A team only ever owns the
   registration that carries its own email, so this is the one check that
   matters — there is no guessing, retry or rate limit needed because a forged
   session simply fails the HMAC check in verifySession.

   Falls back to the legacy Team ID + password flow for rows an admin added by
   hand (those have no email on file, so nobody could ever sign in as them). */
export async function resolveTeam(req) {
  const { teamId, password } = req.body || {};
  const parsed = parseTeamId(teamId);
  if (!parsed) return { status: 400, error: "Team ID looks like FRG-M1-006" };
  const { matchId, slot } = parsed;

  const registration = await findRegistration(matchId, slot);
  if (!registration) return { status: 404, error: "No registration found for that Team ID" };

  const session = sessionFromRequest(req);
  if (session && registration.email) {
    if (session.email !== registration.email) {
      return { status: 403, error: "This team belongs to a different Google account" };
    }
    return { registration, matchId, slot };
  }

  // No session, or the row predates Google sign-in — fall back to the password
  // issued at registration (still rate-limited the same as before).
  if (!password) {
    return registration.email
      ? { status: 401, error: "Sign in with the Google account that registered this team" }
      : { status: 401, error: "Team ID and password are required" };
  }
  const legacy = await authenticateTeam(teamId, password);
  return legacy;
}
