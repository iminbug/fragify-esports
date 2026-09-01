import { kv } from "@vercel/kv";

const TOTAL_SLOTS = 16;
const MAX_MEMBERS = 4;

/* Slot numbers run from FIRST_SLOT upwards — 1..FIRST_SLOT-1 are held back and
   never handed out. The cap is still TOTAL_SLOTS registrations, so with a first
   slot of 6 the lobby fills #06 through #21. */
const FIRST_SLOT = 6;

/* How long an unpaid team keeps its seat before the slot goes back into the pool. */
const HOLD_MINUTES = 20;

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

/* Team names are compared loosely so "Team  Phantom" can't sneak past "team phantom". */
function normalizeTeamName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLowerCase();
}

/* Optional squad IGNs — anything blank is dropped, so an empty list is valid. */
function cleanMembers(raw) {
  if (raw == null) return { members: [] };
  if (!Array.isArray(raw)) return { error: "Squad members must be a list" };

  const members = [];
  for (const entry of raw) {
    const ign = String(entry ?? "").trim().replace(/\s+/g, " ");
    if (!ign) continue;
    if (ign.length < 2 || ign.length > 30) {
      return { error: "Each squad member IGN must be 2-30 characters" };
    }
    if (members.some((m) => m.toLowerCase() === ign.toLowerCase())) {
      return { error: "Squad members must be unique" };
    }
    members.push(ign);
  }
  if (members.length > MAX_MEMBERS) {
    return { error: `A squad can have at most ${MAX_MEMBERS} extra members` };
  }
  return { members };
}

/* A team that hasn't paid holds its seat for HOLD_MINUTES and then loses it. A team
   that has submitted a UTR is waiting on *us*, not the other way round, so it never
   expires — only an admin clears it. */
function isExpiredHold(r) {
  return (
    r?.payment_status === "pending" &&
    typeof r.payment_deadline === "number" &&
    r.payment_deadline < Date.now()
  );
}

/* The live roster, with lapsed holds swept out. There is no cron here, so expiry
   happens lazily on read — and only writes back when something actually changed. */
async function activeRegistrations() {
  const list = await kv.get("registrations:list");
  if (!Array.isArray(list)) return [];

  const live = list.filter((r) => !isExpiredHold(r));
  if (live.length === list.length) return list;

  await kv.set("registrations:list", live);
  for (const dropped of list.filter(isExpiredHold)) {
    await kv.del(`registrations:${dropped.slot_number}`);
    if (dropped.phone) await kv.del(`registrations:phone:${dropped.phone}`);
  }
  return live;
}

/* Seats are handed out by filling the lowest free number, never by counting rows.
   Counting would give a cancelled team's number to the next registration, and two
   teams would end up sharing a slot and a Team ID. */
function nextFreeSlot(list) {
  const taken = new Set(list.map((r) => Number(r.slot_number)));
  for (let slot = FIRST_SLOT; slot < FIRST_SLOT + TOTAL_SLOTS; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/* Entry fee, if an admin has configured one. No config at all means a free
   tournament, and registrations are confirmed on the spot. */
async function getEntryFee() {
  const upi = await kv.get("config:upi");
  if (!upi || !upi.vpa || !(upi.amount > 0)) return null;
  return upi;
}

/* The public teamboard. This endpoint needs no credentials, so it carries the two
   things a spectator has any business seeing — the seat and, once the entry fee is
   settled, who holds it. Never the phone number, leader, Team ID or password.

   A seat that is still paying shows as occupied but nameless: the slot is genuinely
   taken, yet naming a team before its fee clears would put squads on the board that
   may lapse in twenty minutes. */
function publicBoard(list) {
  return list
    .map((r) => {
      // Registrations predating entry fees have no status; they never owed anything.
      const status = r.payment_status || "verified";
      return {
        slot: Number(r.slot_number),
        name: status === "verified" ? r.team_name : null,
        confirmed: status === "verified",
      };
    })
    .sort((a, b) => a.slot - b.slot);
}

/* Admins can close registration early from the panel. The key is absent until the
   toggle is first used, so "not set" means open. */
async function isRegistrationOpen() {
  const stored = await kv.get("config:registration_open");
  return stored === null || stored === undefined ? true : Boolean(stored);
}

/* Whether an admin has a room posted right now. Deliberately just a boolean — the
   credentials themselves are behind /api/room, which checks the team's Team ID and
   password first. This endpoint is public, so it must not leak them. */
async function isRoomLive() {
  const room = await kv.get("config:room");
  return Boolean(room && room.id && room.expiresAt > Date.now());
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const list = await activeRegistrations();
      return res.status(200).json({
        taken: list.length,
        total: TOTAL_SLOTS,
        open: await isRegistrationOpen(),
        roomLive: await isRoomLive(),
        teams: publicBoard(list),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { teamName, leaderName, phone, members: rawMembers } = req.body || {};

    // Server-side validation (frontend validation is not enough)
    if (!teamName || teamName.trim().length < 2) {
      return res.status(400).json({ error: "Team name is required" });
    }
    if (!leaderName || leaderName.trim().length < 2) {
      return res.status(400).json({ error: "Leader IGN is required" });
    }
    const digits = String(phone || "").replace(/\D/g, "");
    if (digits.length !== 10) {
      return res.status(400).json({ error: "Phone number must be exactly 10 digits" });
    }
    const { members, error: memberErr } = cleanMembers(rawMembers);
    if (memberErr) {
      return res.status(400).json({ error: memberErr });
    }

    try {
      // An admin can shut the door before the slots run out.
      if (!(await isRegistrationOpen())) {
        return res.status(403).json({ error: "Registration is currently closed" });
      }

      // Duplicate phone check — one number, one registration.
      const dupPhone = await kv.get(`registrations:phone:${digits}`);
      if (dupPhone) {
        return res.status(409).json({ error: "This number is already registered" });
      }

      // Duplicate team name check. The list is capped at TOTAL_SLOTS entries, so
      // comparing in JS is cheap.
      const regList = await activeRegistrations();
      const normalizedTeamName = normalizeTeamName(teamName);
      if (regList.some((r) => normalizeTeamName(r.team_name) === normalizedTeamName)) {
        return res.status(409).json({ error: "This team name is already registered" });
      }

      const slot = nextFreeSlot(regList);
      if (slot === null) {
        return res.status(409).json({ error: "Registration is full" });
      }

      const teamId = "FRG-" + String(slot).padStart(3, "0");
      const password = genPassword();

      // A configured entry fee puts the team on a hold until the money is verified.
      const entryFee = await getEntryFee();

      const registration = {
        slot_number: slot,
        team_name: teamName.trim(),
        leader_name: leaderName.trim(),
        phone: digits,
        members: members,
        team_id: teamId,
        password: password,
        created_at: new Date().toISOString(),
        payment_status: entryFee ? "pending" : "verified",
        payment_deadline: entryFee ? Date.now() + HOLD_MINUTES * 60 * 1000 : null,
        utr: null,
      };

      regList.push(registration);
      await kv.set("registrations:list", regList);
      await kv.set(`registrations:phone:${digits}`, slot);
      await kv.set(`registrations:${slot}`, registration);

      // null when no community link is configured — the UI then tells the team the
      // link is coming rather than rendering a button that goes nowhere.
      const waLink = (await kv.get("config:whatsapp_link")) || null;

      return res.status(200).json({
        ok: true,
        slot: slot,
        teamId: teamId,
        password: password,
        waLink: waLink,
        // Present only for a paid tournament — the UI then sends the team to the
        // entry-fee section instead of declaring the slot confirmed. The VPA rides
        // along so the confirmation can offer a Pay button without a second fetch.
        paymentDue: entryFee
          ? {
              amount: entryFee.amount,
              holdMinutes: HOLD_MINUTES,
              vpa: entryFee.vpa,
              name: entryFee.name,
              extra: entryFee.extra || {},
            }
          : null,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
