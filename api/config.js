import { kv } from "@vercel/kv";

/* The toggle is absent until an admin flips it, so treat "not set" as open. */
async function isRegistrationOpen() {
  const stored = await kv.get("config:registration_open");
  return stored === null || stored === undefined ? true : Boolean(stored);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const whatsappLink = await kv.get("config:whatsapp_link");
      return res.status(200).json({
        whatsappLink: whatsappLink || "https://chat.whatsapp.com/",
        registrationOpen: await isRegistrationOpen(),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { whatsappLink, registrationOpen, adminKey } = req.body || {};

    if (!process.env.ADMIN_KEY) {
      return res.status(500).json({ error: "Admin key is not configured on the server" });
    }
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Both settings live here; a request may carry either one on its own.
      if (whatsappLink !== undefined) {
        await kv.set("config:whatsapp_link", whatsappLink);
      }
      if (registrationOpen !== undefined) {
        await kv.set("config:registration_open", registrationOpen ? 1 : 0);
      }
      return res.status(200).json({
        ok: true,
        registrationOpen: await isRegistrationOpen(),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
