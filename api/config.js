import { kv } from "@vercel/kv";

/* The toggle is absent until an admin flips it, so treat "not set" as open. */
async function isRegistrationOpen() {
  const stored = await kv.get("config:registration_open");
  return stored === null || stored === undefined ? true : Boolean(stored);
}

/* Match details an admin can edit from the panel. Anything left blank is dropped so
   the page can hide that tile instead of showing an empty one. */
const DETAIL_KEYS = [
  "date", "time", "maps", "slots", "entryFee",
  "prizePool", "prize1", "prize2", "prizeKills",
];
const MAX_VALUE_LEN = 120;
const MAX_RULES = 12;
const MAX_RULE_LEN = 200;

function cleanTournament(raw) {
  if (raw == null) return { tournament: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Match details must be an object" };
  }

  const tournament = {};
  for (const key of DETAIL_KEYS) {
    const value = String(raw[key] ?? "").trim().replace(/\s+/g, " ");
    if (!value) continue;
    if (value.length > MAX_VALUE_LEN) {
      return { error: `"${key}" is too long (max ${MAX_VALUE_LEN} characters)` };
    }
    tournament[key] = value;
  }

  const rawRules = raw.rules;
  if (rawRules != null) {
    if (!Array.isArray(rawRules)) return { error: "Rules must be a list" };
    const rules = [];
    for (const entry of rawRules) {
      const rule = String(entry ?? "").trim();
      if (!rule) continue;
      if (rule.length > MAX_RULE_LEN) {
        return { error: `A rule is too long (max ${MAX_RULE_LEN} characters)` };
      }
      rules.push(rule);
    }
    if (rules.length > MAX_RULES) {
      return { error: `At most ${MAX_RULES} rules` };
    }
    if (rules.length) tournament.rules = rules;
  }

  return { tournament };
}

/* Stored links must be absolute — a scheme-less value would be treated as a relative
   URL by the browser and send the team to a page on this site instead. */
function normalizeLink(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const withScheme = /^https?:\/\//i.test(value) ? value : "https://" + value;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
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
        tournament: (await kv.get("config:tournament")) || {},
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { whatsappLink, registrationOpen, tournament, adminKey } = req.body || {};

    if (!process.env.ADMIN_KEY) {
      return res.status(500).json({ error: "Admin key is not configured on the server" });
    }
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Both settings live here; a request may carry either one on its own.
      if (whatsappLink !== undefined) {
        const link = normalizeLink(whatsappLink);
        if (!link) {
          return res.status(400).json({ error: "Enter a valid link, e.g. https://chat.whatsapp.com/..." });
        }
        await kv.set("config:whatsapp_link", link);
      }
      if (registrationOpen !== undefined) {
        await kv.set("config:registration_open", registrationOpen ? 1 : 0);
      }
      if (tournament !== undefined) {
        const { tournament: cleaned, error } = cleanTournament(tournament);
        if (error) return res.status(400).json({ error });
        await kv.set("config:tournament", cleaned || {});
      }
      return res.status(200).json({
        ok: true,
        registrationOpen: await isRegistrationOpen(),
        tournament: (await kv.get("config:tournament")) || {},
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
