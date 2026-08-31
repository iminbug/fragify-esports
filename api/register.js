import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const TOTAL_SLOTS = 16;
const MAX_MEMBERS = 4;

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

async function countTaken() {
  const { count, error } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count || 0;
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
      // Duplicate phone check — one number, one registration.
      const { data: dupPhone, error: phoneErr } = await supabase
        .from("registrations")
        .select("slot_number")
        .eq("phone", digits);

      if (phoneErr) throw new Error(phoneErr.message);
      if (dupPhone && dupPhone.length > 0) {
        return res.status(409).json({ error: "This number is already registered" });
      }

      // Duplicate team name check. The table is capped at TOTAL_SLOTS rows, so
      // comparing in JS is cheap and avoids ILIKE wildcard surprises in the name.
      const { data: existingTeams, error: teamErr } = await supabase
        .from("registrations")
        .select("team_name");

      if (teamErr) throw new Error(teamErr.message);
      const wanted = normalizeTeamName(teamName);
      if ((existingTeams || []).some((t) => normalizeTeamName(t.team_name) === wanted)) {
        return res.status(409).json({ error: "This team name is already registered" });
      }

      // Assign the next free slot. slot_number has a UNIQUE constraint, so if two
      // requests race for the same number one insert fails — retry with the next one.
      let inserted = null;
      let duplicateError = null;

      for (let attempt = 0; attempt < TOTAL_SLOTS; attempt++) {
        const { data: rows, error: maxErr } = await supabase
          .from("registrations")
          .select("slot_number")
          .order("slot_number", { ascending: false })
          .limit(1);

        if (maxErr) throw new Error(maxErr.message);

        const taken = await countTaken();
        if (taken >= TOTAL_SLOTS) {
          return res.status(409).json({ error: "Registration is full" });
        }

        const slot = (rows?.[0]?.slot_number || 0) + 1;
        if (slot > TOTAL_SLOTS) {
          return res.status(409).json({ error: "Registration is full" });
        }

        const teamId = "FRG-" + String(slot).padStart(3, "0");
        const password = genPassword();

        const { error: insertErr } = await supabase.from("registrations").insert({
          team_name: teamName.trim(),
          leader_name: leaderName.trim(),
          phone: digits,
          members: members,
          slot_number: slot,
          team_id: teamId,
          password: password,
        });

        if (!insertErr) {
          inserted = { slot, teamId, password };
          break;
        }

        // 23505 = unique violation. It can mean a raced slot_number (retry) or a
        // raced phone/team_name that slipped past the checks above (give up).
        if (insertErr.code !== "23505") {
          throw new Error(insertErr.message);
        }

        const detail = `${insertErr.message} ${insertErr.details || ""}`.toLowerCase();
        if (detail.includes("phone")) {
          duplicateError = "This number is already registered";
          break;
        }
        if (detail.includes("team_name")) {
          duplicateError = "This team name is already registered";
          break;
        }
        // else: slot_number collision — loop and try the next slot
      }

      if (duplicateError) {
        return res.status(409).json({ error: duplicateError });
      }
      if (!inserted) {
        return res.status(409).json({ error: "Could not assign a slot, please retry" });
      }

      const { data: config } = await supabase
        .from("config")
        .select("whatsapp_link")
        .eq("id", 1)
        .single();

      return res.status(200).json({
        ok: true,
        slot: inserted.slot,
        teamId: inserted.teamId,
        password: inserted.password,
        waLink: config?.whatsapp_link || "https://chat.whatsapp.com/",
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
