const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("config")
      .select("whatsapp_link")
      .eq("id", 1)
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ whatsappLink: data.whatsapp_link });
  }

  if (req.method === "POST") {
    const { whatsappLink, adminKey } = req.body;

    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { error } = await supabase
      .from("config")
      .update({ whatsapp_link: whatsappLink, updated_at: new Date() })
      .eq("id", 1);

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  res.status(405).json({ error: "Method not allowed" });
}
