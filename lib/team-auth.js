import { kv } from "@vercel/kv";

/* Shared by the room and payment endpoints: both hand a team its own data only after
   it proves it holds the Team ID and password issued at registration.

   Lives outside api/ on purpose — every .js file inside api/ is turned into a route by
   Vercel, and this module has no request handler to expose. */

/* A wrong password is cheap to retry over HTTP, so cap the guesses per team. */
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SECONDS = 300;

/* "FRG-006" -> 6. Anything else is not a Team ID we ever issued. */
export function slotFromTeamId(raw) {
  const match = /^FRG-(\d{1,4})$/i.exec(String(raw ?? "").trim());
  return match ? Number(match[1]) : null;
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

/* Registrations are written both to a per-slot key and into the list. Teams that
   registered before the per-slot key existed only appear in the list, so fall back to
   it rather than telling an already-registered team their ID is wrong. */
export async function findRegistration(slot) {
  const direct = await kv.get(`registrations:${slot}`);
  if (direct) return direct;

  const list = await kv.get("registrations:list");
  if (!Array.isArray(list)) return null;
  return list.find((r) => Number(r?.slot_number) === slot) || null;
}

/* Returns { registration, slot } on success, or { status, error } ready to send back
   to the caller unchanged. */
export async function authenticateTeam(teamId, password) {
  const slot = slotFromTeamId(teamId);
  if (slot === null) return { status: 400, error: "Team ID looks like FRG-006" };

  const attemptsKey = `team:attempts:${slot}`;
  const attempts = await kv.incr(attemptsKey);
  if (attempts === 1) await kv.expire(attemptsKey, ATTEMPT_WINDOW_SECONDS);
  if (attempts > MAX_ATTEMPTS) {
    return { status: 429, error: "Too many tries. Wait 5 minutes." };
  }

  const registration = await findRegistration(slot);
  const given = String(password ?? "").trim().toUpperCase();
  if (!registration || !sameSecret(registration.password, given)) {
    return { status: 401, error: "Team ID or password is incorrect" };
  }

  // A correct login clears the counter so a team that fat-fingered it once isn't
  // locked out later.
  await kv.del(attemptsKey);
  return { registration, slot };
}

/* Registrations live in two places and must not drift apart. */
export async function writeRegistration(slot, updated) {
  const list = (await kv.get("registrations:list")) || [];
  const idx = Array.isArray(list)
    ? list.findIndex((r) => Number(r?.slot_number) === slot)
    : -1;
  if (idx !== -1) {
    list[idx] = updated;
    await kv.set("registrations:list", list);
  }
  await kv.set(`registrations:${slot}`, updated);
  return updated;
}
