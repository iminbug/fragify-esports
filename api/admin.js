import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, adminKey } = req.body || {};

  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (action === "list") {
    const { data, error } = await supabase
      .from("registrations")
      .select("slot_number, team_name, leader_name, phone, team_id, password")
      .order("slot_number", { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ registrations: data });
  }

  if (action === "reset") {
    const { error } = await supabase
      .from("registrations")
      .delete()
      .gte("slot_number", 0);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: "Unknown action" });
}
