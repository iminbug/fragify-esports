import { kv } from "@vercel/kv";

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

  try {
    if (action === "list") {
      const regList = (await kv.get("registrations:list")) || [];
      return res.status(200).json({ registrations: regList });
    }

    if (action === "reset") {
      const regList = (await kv.get("registrations:list")) || [];
      for (const reg of regList) {
        await kv.del(`registrations:phone:${reg.phone}`);
        await kv.del(`registrations:${reg.slot_number}`);
      }
      await kv.del("registrations:list");
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
