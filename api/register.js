const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

function genPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let p = "";
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)];
  return p;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("registrations")
      .select("id", { count: "exact" });

    if (error) return res.status(500).json({ error: error.message });
    const taken = data?.length || 0;
    return res.status(200).json({ taken, total: 16 });
  }

  if (req.method === "POST") {
    const { teamName, leaderName, phone } = req.body;

    // Check 16-limit
    const { data: existing, error: countErr } = await supabase
      .from("registrations")
      .select("id", { count: "exact" });

    if (countErr) return res.status(500).json({ error: countErr.message });
    if (existing.length >= 16) {
      return res.status(409).json({ error: "Registration full" });
    }

    // Check duplicate phone
    const { data: dup } = await supabase
      .from("registrations")
      .select("id")
      .eq("phone", phone);

    if (dup.length > 0) {
      return res.status(400).json({ error: "Phone already registered" });
    }

    // Assign slot
    const slot = existing.length + 1;
    const teamId = "FRG-" + String(slot).padStart(3, "0");
    const password = genPassword();

    const { error: insertErr } = await supabase.from("registrations").insert({
      team_name: teamName,
      leader_name: leaderName,
      phone: phone,
      slot_number: slot,
      team_id: teamId,
      password: password,
    });

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message });
    }

    // Fetch latest config for WA link
    const { data: config } = await supabase
      .from("config")
      .select("whatsapp_link")
      .eq("id", 1)
      .single();

    return res.status(200).json({
      ok: true,
      slot,
      teamId,
      password,
      waLink: config?.whatsapp_link || "https://chat.whatsapp.com/",
    });
  }

  res.status(405).json({ error: "Method not allowed" });
}
