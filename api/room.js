import { kv } from "@vercel/kv";

/* Room credentials are handed out only to teams that actually registered, so this
   endpoint checks the Team ID and password issued at registration before returning
   anything. The public slots endpoint only ever says whether a room is live. */

/* A wrong password is cheap to retry over HTTP, so cap the guesses per team. */
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_SECONDS = 300;

/* "FRG-006" -> 6. Anything else is not a Team ID we ever issued. */
function slotFromTeamId(raw) {
  const match = /^FRG-(\d{1,4})$/i.exec(String(raw ?? "").trim());
  return match ? Number(match[1]) : null;
}

/* Compare in constant time so response timing can't leak how much of the password
   was right. */
function sameSecret(a, b) {
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
async function findRegistration(slot) {
  const direct = await kv.get(`registrations:${slot}`);
  if (direct) return direct;

  const list = await kv.get("registrations:list");
  if (!Array.isArray(list)) return null;
  return list.find((r) => Number(r?.slot_number) === slot) || null;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Credentials are per-team and time-limited — never let a proxy hold on to them.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { teamId, password } = req.body || {};
  const slot = slotFromTeamId(teamId);
  if (slot === null) {
    return res.status(400).json({ error: "Team ID looks like FRG-006" });
  }

  try {
    const attemptsKey = `room:attempts:${slot}`;
    const attempts = await kv.incr(attemptsKey);
    if (attempts === 1) await kv.expire(attemptsKey, ATTEMPT_WINDOW_SECONDS);
    if (attempts > MAX_ATTEMPTS) {
      return res.status(429).json({ error: "Too many tries. Wait 5 minutes." });
    }

    const registration = await findRegistration(slot);
    const given = String(password ?? "").trim().toUpperCase();
    if (!registration || !sameSecret(registration.password, given)) {
      return res.status(401).json({ error: "Team ID ya password galat hai" });
    }

    // A correct login clears the counter so a team that fat-fingered it once
    // isn't locked out later.
    await kv.del(attemptsKey);

    const room = await kv.get("config:room");
    const secondsLeft = room?.expiresAt
      ? Math.ceil((room.expiresAt - Date.now()) / 1000)
      : 0;

    return res.status(200).json({
      ok: true,
      team: registration.team_name,
      // null when nothing is posted yet — the team is verified, the room just
      // isn't open, and the UI says so instead of showing an error.
      room: room?.id && secondsLeft > 0
        ? { id: room.id, password: room.password, secondsLeft }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
