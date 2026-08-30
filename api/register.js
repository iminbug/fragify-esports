import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const TOTAL_SLOTS = 16;

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
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
    const { teamName, leaderName, phone } = req.body || {};

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

    try {
      // Duplicate phone check
      const { data: dup } = await supabase
        .from("registrations")
        .select("slot_number")
        .eq("phone", digits);

      if (dup && dup.length > 0) {
        return res.status(400).json({ error: "This number is already registered" });
      }

      // Assign the next free slot. slot_number has a UNIQUE constraint, so if two
      // requests race for the same number one insert fails — retry with the next one.
      let inserted = null;
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
          slot_number: slot,
          team_id: teamId,
          password: password,
        });

        if (!insertErr) {
          inserted = { slot, teamId, password };
          break;
        }

        // 23505 = unique violation → someone took this slot first, retry
        if (insertErr.code !== "23505") {
          throw new Error(insertErr.message);
        }
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
