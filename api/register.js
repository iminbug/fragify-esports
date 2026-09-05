import { kv } from "@vercel/kv";
import {
  MAX_MEMBERS,
  HOLD_MINUTES,
  matchKeys,
  getMatch,
  getAllMatches,
  activeRegistrations,
  nextFreeSlot,
  isRoomLive,
} from "../lib/matches.js";

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

/* The public teamboard of one match. This endpoint needs no credentials, so it carries
   the two things a spectator has any business seeing — the seat and, once the entry
   fee is settled, who holds it. Never the phone number, leader, Team ID or password.

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Slot counts and the teamboards go stale within seconds; never serve them cached.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      /* One public payload for every match at once, so the page needs a single fetch
         to draw every board and every form option. Per-match fees travel as a bare
         amount — the VPA and QR parameters only matter to a team that registered, and
         they get those from /api/register (POST) and /api/payment. */
      const matches = [];
      for (const match of await getAllMatches()) {
        const list = await activeRegistrations(match.id);
        matches.push({
          id: match.id,
          name: match.name,
          matchTime: match.matchTime,
          totalSlots: match.totalSlots,
          firstSlot: match.firstSlot,
          taken: list.length,
          open: match.registrationOpen,
          roomLive: await isRoomLive(match.id),
          feeAmount: match.entryFee ? match.entryFee.amount : null,
          teams: publicBoard(list),
        });
      }
      return res.status(200).json({ matches });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { matchId, teamName, leaderName, phone, members: rawMembers } = req.body || {};

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
      const match = await getMatch(matchId);
      if (!match) {
        return res.status(400).json({ error: "Pick which match you want to enter" });
      }

      // An admin can shut one match's door while the others stay open.
      if (!match.registrationOpen) {
        return res.status(403).json({ error: "Registration for this match is closed" });
      }

      // Duplicate phone check — one number, one registration *per match*. The same
      // squad entering another match is fine; that is the point of multiple matches.
      const dupPhone = await kv.get(matchKeys.phone(match.id, digits));
      if (dupPhone) {
        return res.status(409).json({ error: "This number is already registered for this match" });
      }

      // Duplicate team name check, within this match only. The list is capped at
      // the match's slot count, so comparing in JS is cheap.
      const regList = await activeRegistrations(match.id);
      const normalizedTeamName = normalizeTeamName(teamName);
      if (regList.some((r) => normalizeTeamName(r.team_name) === normalizedTeamName)) {
        return res.status(409).json({ error: "This team name is already registered for this match" });
      }

      const slot = nextFreeSlot(match, regList);
      if (slot === null) {
        return res.status(409).json({ error: "This match is full" });
      }

      /* The match id lives inside the Team ID because slot numbers repeat across
         matches — #06 exists in every lobby, so "FRG-006" alone names nobody. */
      const teamId = `FRG-${match.id}-${String(slot).padStart(3, "0")}`;
      const password = genPassword();

      // A configured entry fee puts the team on a hold until the money is verified.
      const entryFee = match.entryFee;

      const registration = {
        match_id: match.id,
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
      await kv.set(matchKeys.list(match.id), regList);
      await kv.set(matchKeys.phone(match.id, digits), slot);
      await kv.set(matchKeys.slot(match.id, slot), registration);

      // null when no community link is configured — the UI then tells the team the
      // link is coming rather than rendering a button that goes nowhere.
      //
      // A team that still owes the entry fee gets nothing here at all: the invite is
      // the one thing an unpaid squad could take and walk away with, so it is held
      // back until an admin verifies the payment and /api/payment hands it over.
      const waLink = entryFee ? null : match.whatsappLink;

      return res.status(200).json({
        ok: true,
        slot: slot,
        teamId: teamId,
        password: password,
        waLink: waLink,
        match: { id: match.id, name: match.name, matchTime: match.matchTime },
        // Present only for a paid match — the UI then sends the team to the
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
