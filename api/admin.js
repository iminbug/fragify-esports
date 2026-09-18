import { kv } from "@vercel/kv";
import {
  MAX_MEMBERS,
  HOLD_MINUTES,
  matchKeys,
  normalizeMatchId,
  getMatch,
  getAllMatches,
  activeRegistrations,
  nextFreeSlot,
  writeRegistration,
  cancelRegistration,
  resetMatchRegistrations,
} from "../lib/matches.js";
import { findRegistration } from "../lib/team-auth.js";

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let password = "";
  for (let i = 0; i < 6; i++) password += chars[Math.floor(Math.random() * chars.length)];
  return password;
}

function normalizeTeamName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLowerCase();
}

function cleanMembers(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error("Squad members must be a list");
  const members = raw.map((entry) => String(entry ?? "").trim().replace(/\s+/g, " ")).filter(Boolean);
  if (members.length > MAX_MEMBERS) throw new Error(`A squad can have at most ${MAX_MEMBERS} extra members`);
  if (members.some((member) => member.length < 2 || member.length > 30)) {
    throw new Error("Each squad member IGN must be 2-30 characters");
  }
  if (new Set(members.map((member) => member.toLowerCase())).size !== members.length) {
    throw new Error("Squad members must be unique");
  }
  return members;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, matchId: rawMatchId, slot: rawSlot, adminKey } = req.body || {};

  // Distinguish "server has no key configured" from "wrong key" — otherwise a
  // missing env var looks identical to a typo and is painful to diagnose.
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: "Admin key is not configured on the server" });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    /* Everything about every match in one payload: the full config (fee included, so
       the editor can prefill it) plus the live roster. Admin-only, hence the key check
       above — this is the one response that carries phones and passwords. */
    if (action === "list") {
      const matches = [];
      for (const match of await getAllMatches()) {
        matches.push({
          ...match,
          registrations: await activeRegistrations(match.id),
        });
      }
      return res.status(200).json({ matches });
    }

    // Everything below acts on one match.
    const matchId = normalizeMatchId(rawMatchId);
    const match = matchId ? await getMatch(matchId) : null;
    if (!match) {
      return res.status(400).json({ error: "A match id is required" });
    }

    if (action === "reset") {
      await resetMatchRegistrations(match.id);
      return res.status(200).json({ ok: true });
    }

    if (action === "add") {
      const { teamName, leaderName, phone: rawPhone, members: rawMembers } = req.body || {};
      if (!teamName || String(teamName).trim().length < 2) {
        return res.status(400).json({ error: "Team name is required" });
      }
      if (!leaderName || String(leaderName).trim().length < 2) {
        return res.status(400).json({ error: "Leader IGN is required" });
      }
      const phone = String(rawPhone || "").replace(/\D/g, "");
      if (phone.length !== 10) {
        return res.status(400).json({ error: "Phone number must be exactly 10 digits" });
      }
      let members;
      try {
        members = cleanMembers(rawMembers);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
      const registrations = await activeRegistrations(match.id);
      if (await kv.get(matchKeys.phone(match.id, phone))) {
        return res.status(409).json({ error: "This number is already registered for this match" });
      }
      if (registrations.some((r) => normalizeTeamName(r.team_name) === normalizeTeamName(teamName))) {
        return res.status(409).json({ error: "This team name is already registered for this match" });
      }
      const slot = nextFreeSlot(match, registrations);
      if (slot === null) return res.status(409).json({ error: "This match is full" });

      const registration = {
        match_id: match.id,
        slot_number: slot,
        team_name: String(teamName).trim(),
        leader_name: String(leaderName).trim(),
        phone,
        members,
        team_id: `FRG-${match.id}-${String(slot).padStart(3, "0")}`,
        password: genPassword(),
        created_at: new Date().toISOString(),
        payment_status: "verified",
        payment_deadline: null,
        verified_at: new Date().toISOString(),
        utr: null,
        added_by_admin: true,
      };
      registrations.push(registration);
      await kv.set(matchKeys.list(match.id), registrations);
      await kv.set(matchKeys.phone(match.id, phone), slot);
      await kv.set(matchKeys.slot(match.id, slot), registration);
      return res.status(200).json({ ok: true, registration });
    }

    // Everything below acts on one team.
    if (action === "verify" || action === "reject" || action === "cancel") {
      const slot = Number(rawSlot);
      if (!Number.isInteger(slot)) {
        return res.status(400).json({ error: "A slot number is required" });
      }

      if (action === "cancel") {
        const removed = await cancelRegistration(match.id, slot);
        if (!removed) return res.status(404).json({ error: "No team in that slot" });
        return res.status(200).json({ ok: true });
      }

      const registration = await findRegistration(match.id, slot);
      if (!registration) return res.status(404).json({ error: "No team in that slot" });

      if (action === "verify") {
        await writeRegistration(match.id, slot, {
          ...registration,
          payment_status: "verified",
          payment_deadline: null,
          verified_at: new Date().toISOString(),
        });
      } else {
        // Rejecting hands the slot back to the team rather than deleting it — the
        // usual cause is a mistyped UTR, and re-registering would lose their squad.
        await writeRegistration(match.id, slot, {
          ...registration,
          payment_status: "pending",
          utr: null,
          payment_deadline: Date.now() + HOLD_MINUTES * 60 * 1000,
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
