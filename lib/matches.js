import { kv } from "@vercel/kv";

/* Everything match-scoped lives here. A "match" is one time-slot on match day — its
   own registration form, its own slot pool, its own entry fee, room and WhatsApp
   invite. Several can be open at once, which is the whole point.

   Lives outside api/ on purpose — every .js file inside api/ becomes a route on
   Vercel, and this module has no request handler to expose. */

export const MAX_MEMBERS = 4;
export const DEFAULT_TOTAL_SLOTS = 16;
export const DEFAULT_FIRST_SLOT = 6;
export const MAX_MATCHES = 20;

/* How long an unpaid team keeps its seat before the slot goes back into the pool. */
export const HOLD_MINUTES = 20;

/* Every KV key is scoped by match id, so two open matches can never see each other's
   registrations — including the phone dedupe, which is deliberately per-match: the
   same squad is welcome in both the 6 PM and the 8 PM lobby. */
export const matchKeys = {
  index: "matches:index",
  counter: "matches:counter",
  config: (id) => `match:${id}:config`,
  room: (id) => `match:${id}:room`,
  list: (id) => `match:${id}:registrations:list`,
  slot: (id, slot) => `match:${id}:registrations:${slot}`,
  phone: (id, digits) => `match:${id}:registrations:phone:${digits}`,
};

/* Match ids are always "M" + a counter — anything else never came from us. */
export function normalizeMatchId(raw) {
  const m = /^M\d{1,4}$/i.exec(String(raw ?? "").trim());
  return m ? m[0].toUpperCase() : null;
}

export async function listMatchIds() {
  const ids = await kv.get(matchKeys.index);
  return Array.isArray(ids) ? ids : [];
}

/* Reads a match and fills in defaults, so a config written by an older deploy can't
   hand out a zero-slot lobby. Returns null for a match we never created. */
export async function getMatch(id) {
  const normalized = normalizeMatchId(id);
  if (!normalized) return null;
  const config = await kv.get(matchKeys.config(normalized));
  if (!config || typeof config !== "object") return null;

  const totalSlots = Number(config.totalSlots);
  const firstSlot = Number(config.firstSlot);
  const fee = config.entryFee;

  return {
    id: normalized,
    name: String(config.name || `Match ${normalized}`),
    matchTime: String(config.matchTime || ""),
    totalSlots: Number.isInteger(totalSlots) && totalSlots > 0 ? totalSlots : DEFAULT_TOTAL_SLOTS,
    firstSlot: Number.isInteger(firstSlot) && firstSlot > 0 ? firstSlot : DEFAULT_FIRST_SLOT,
    whatsappLink: config.whatsappLink || null,
    // Read through a guard so a half-written fee can't put a match into a paid state.
    entryFee: fee?.vpa && fee.amount > 0 ? fee : null,
    registrationOpen: config.registrationOpen !== false,
    createdAt: config.createdAt || null,
  };
}

/* All matches, in the order they were created. */
export async function getAllMatches() {
  const ids = await listMatchIds();
  const matches = [];
  for (const id of ids) {
    const match = await getMatch(id);
    if (match) matches.push(match);
  }
  return matches;
}

/* Ids come off a counter that only ever goes up, so a deleted M2 is never reissued —
   an old Team ID like FRG-M2-007 can then never unlock a stranger's slot. */
export async function nextMatchId() {
  const n = await kv.incr(matchKeys.counter);
  return `M${n}`;
}

export async function saveMatch(match) {
  await kv.set(matchKeys.config(match.id), match);
  const ids = await listMatchIds();
  if (!ids.includes(match.id)) {
    ids.push(match.id);
    await kv.set(matchKeys.index, ids);
  }
  return match;
}

/* Clears a match's registrations and frees every seat. The phone keys have to go
   too — otherwise those numbers could never register for this match again. */
export async function resetMatchRegistrations(id) {
  const list = (await kv.get(matchKeys.list(id))) || [];
  for (const reg of Array.isArray(list) ? list : []) {
    await kv.del(matchKeys.slot(id, reg.slot_number));
    if (reg.phone) await kv.del(matchKeys.phone(id, reg.phone));
  }
  await kv.del(matchKeys.list(id));
}

/* Removes a match entirely: registrations, room, config, and its place in the index. */
export async function deleteMatch(id) {
  await resetMatchRegistrations(id);
  await kv.del(matchKeys.room(id));
  await kv.del(matchKeys.config(id));
  const ids = await listMatchIds();
  await kv.set(matchKeys.index, ids.filter((x) => x !== id));
}

/* A team that hasn't paid holds its seat for HOLD_MINUTES and then loses it. A team
   that has submitted a UTR is waiting on *us*, not the other way round, so it never
   expires — only an admin clears it. */
export function isExpiredHold(r) {
  return (
    r?.payment_status === "pending" &&
    typeof r.payment_deadline === "number" &&
    r.payment_deadline < Date.now()
  );
}

/* The live roster of one match, with lapsed holds swept out. There is no cron here,
   so expiry happens lazily on read — and only writes back when something changed. */
export async function activeRegistrations(matchId) {
  const list = await kv.get(matchKeys.list(matchId));
  if (!Array.isArray(list)) return [];

  const live = list.filter((r) => !isExpiredHold(r));
  if (live.length === list.length) return list;

  await kv.set(matchKeys.list(matchId), live);
  for (const dropped of list.filter(isExpiredHold)) {
    await kv.del(matchKeys.slot(matchId, dropped.slot_number));
    if (dropped.phone) await kv.del(matchKeys.phone(matchId, dropped.phone));
  }
  return live;
}

/* Seats are handed out by filling the lowest free number, never by counting rows.
   Counting would give a cancelled team's number to the next registration, and two
   teams would end up sharing a slot and a Team ID. */
export function nextFreeSlot(match, list) {
  const taken = new Set(list.map((r) => Number(r.slot_number)));
  for (let slot = match.firstSlot; slot < match.firstSlot + match.totalSlots; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/* Registrations live in two places (the per-slot key and the list) and must not
   drift apart. */
export async function writeRegistration(matchId, slot, updated) {
  const list = (await kv.get(matchKeys.list(matchId))) || [];
  const idx = Array.isArray(list)
    ? list.findIndex((r) => Number(r?.slot_number) === Number(slot))
    : -1;
  if (idx !== -1) {
    list[idx] = updated;
    await kv.set(matchKeys.list(matchId), list);
  }
  await kv.set(matchKeys.slot(matchId, slot), updated);
  return updated;
}

/* Removes one team and frees its seat. All three keys have to go, especially the
   phone one — otherwise that number could never register for this match again. */
export async function cancelRegistration(matchId, slot) {
  const list = (await kv.get(matchKeys.list(matchId))) || [];
  const target = Array.isArray(list)
    ? list.find((r) => Number(r?.slot_number) === Number(slot))
    : null;
  if (!target) return false;

  await kv.set(
    matchKeys.list(matchId),
    list.filter((r) => Number(r?.slot_number) !== Number(slot))
  );
  await kv.del(matchKeys.slot(matchId, slot));
  if (target.phone) await kv.del(matchKeys.phone(matchId, target.phone));
  return true;
}

/* Whether an admin has a room posted for this match right now. Deliberately just a
   boolean — the credentials themselves are behind /api/room, which checks the team's
   Team ID and password first. */
export async function isRoomLive(matchId) {
  const room = await kv.get(matchKeys.room(matchId));
  return Boolean(room && room.id && room.expiresAt > Date.now());
}
