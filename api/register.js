import { kv } from "@vercel/kv";

const TOTAL_SLOTS = 16;
const MAX_MEMBERS = 4;

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

function normalizeTeamName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLowerCase();
}

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

async function countTaken() {
  const regList = await kv.get("registrations:list");
  return Array.isArray(regList) ? regList.length : 0;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const taken = await countTaken();
      return res.status(200).json({ taken, total: TOTAL_SLOTS });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { teamName, leaderName, phone, members: rawMembers } = req.body || {};

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
      const dupPhone = await kv.get(`registrations:phone:${digits}`);
      if (dupPhone) {
        return res.status(409).json({ error: "This number is already registered" });
      }

      const regList = (await kv.get("registrations:list")) || [];
      const normalizedTeamName = normalizeTeamName(teamName);
      if (regList.some((r) => normalizeTeamName(r.team_name) === normalizedTeamName)) {
        return res.status(409).json({ error: "This team name is already registered" });
      }

      if (regList.length >= TOTAL_SLOTS) {
        return res.status(409).json({ error: "Registration is full" });
      }

      const slot = regList.length + 1;
      const teamId = "FRG-" + String(slot).padStart(3, "0");
      const password = genPassword();

      const registration = {
        slot_number: slot,
        team_name: teamName.trim(),
        leader_name: leaderName.trim(),
        phone: digits,
        members: members,
        team_id: teamId,
        password: password,
        created_at: new Date().toISOString(),
      };

      regList.push(registration);
      await kv.set("registrations:list", regList);
      await kv.set(`registrations:phone:${digits}`, slot);
      await kv.set(`registrations:${slot}`, registration);

      const waLink = (await kv.get("config:whatsapp_link")) || "https://chat.whatsapp.com/";

      return res.status(200).json({
        ok: true,
        slot: slot,
        teamId: teamId,
        password: password,
        waLink: waLink,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
