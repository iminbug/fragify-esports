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

/* Room credentials are deliberately short-lived: Redis drops the key on its own after
   ROOM_TTL_SECONDS, so a forgotten room ID can't sit on a public page all night. */
const ROOM_TTL_SECONDS = 10 * 60;
const MAX_ROOM_FIELD_LEN = 40;

async function saveRoom(raw) {
  // An explicit null means "take it down now".
  if (raw === null) {
    await kv.del("config:room");
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Room details must be an object" };
  }

  const id = String(raw.id ?? "").trim();
  const password = String(raw.password ?? "").trim();
  if (!id || !password) {
    return { error: "Room ID and password are both required" };
  }
  if (id.length > MAX_ROOM_FIELD_LEN || password.length > MAX_ROOM_FIELD_LEN) {
    return { error: `Room ID and password must be under ${MAX_ROOM_FIELD_LEN} characters` };
  }

  await kv.set(
    "config:room",
    { id, password, expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 },
    { ex: ROOM_TTL_SECONDS }
  );
  return {};
}

/* Entry fee. No config at all means a free tournament, which is why an explicit null
   has to be accepted — that is how an admin turns payments back off. */
const VPA_PATTERN = /^[\w.\-]{2,64}@[A-Za-z]{2,32}$/;
const MAX_PAYEE_NAME_LEN = 40;
const MAX_AMOUNT = 10000;

/* A merchant QR carries a signature alongside the VPA. Send only `pa` and the paying
   app rejects the intent — "the receiver is not accepting payments on this specific
   UPI ID" — even though that same VPA works fine when typed by hand. So an admin may
   paste the whole scanned QR string and these parameters ride along untouched.

   Deliberately an allow-list: `tr`/`tid` would pin every team to one transaction id,
   and `am`/`tn` are ours to set per team. */
const QR_PASSTHROUGH = ["mc", "mode", "orgid", "sign", "purpose"];
const MAX_PARAM_LEN = 512;
const PARAM_PATTERN = /^[A-Za-z0-9+/=_.:\-]+$/;

/* Accepts either a bare `name@bank` or a full `upi://pay?pa=...&sign=...` string, and
   returns the VPA plus whatever signed parameters came with it.

   Split by hand rather than with URLSearchParams: a QR's signature is base64, and
   URLSearchParams applies form decoding, which turns every literal "+" in it into a
   space — a silently corrupted signature the paying app would then reject. */
function parsePayee(input) {
  const value = String(input ?? "").trim();
  if (!value.includes("?")) return { vpa: value, extra: {} };

  const fields = new Map();
  for (const pair of value.slice(value.indexOf("?") + 1).split("&")) {
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const key = pair.slice(0, eq).trim().toLowerCase();
    if (fields.has(key)) continue;
    try {
      fields.set(key, decodeURIComponent(pair.slice(eq + 1)).trim());
    } catch {
      fields.set(key, pair.slice(eq + 1).trim());
    }
  }

  const extra = {};
  for (const key of QR_PASSTHROUGH) {
    const param = fields.get(key) || "";
    if (!param || param.length > MAX_PARAM_LEN || !PARAM_PATTERN.test(param)) continue;
    extra[key] = param;
  }
  return { vpa: fields.get("pa") || "", extra };
}

async function saveUpi(raw) {
  if (raw === null) {
    await kv.del("config:upi");
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Entry fee settings must be an object" };
  }

  const { vpa, extra } = parsePayee(raw.vpa);
  if (!VPA_PATTERN.test(vpa)) {
    return { error: "UPI ID aisi dikhti hai: yourname@ybl (ya poora QR link paste karo)" };
  }

  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return { error: `Entry fee 1 se ${MAX_AMOUNT} ke beech poora rupee hona chahiye` };
  }

  const name = String(raw.name ?? "").trim().replace(/\s+/g, " ") || "Fragify Esports";
  if (name.length > MAX_PAYEE_NAME_LEN) {
    return { error: `Payee name ${MAX_PAYEE_NAME_LEN} characters se chhota rakho` };
  }

  // Optional. UPI apps refuse link-started payments to a personal VPA, so a number
  // teams can pay directly is the fallback that always works.
  const phone = String(raw.phone ?? "").replace(/\D/g, "");
  if (phone && phone.length !== 10) {
    return { error: "UPI mobile number 10 digit ka hona chahiye" };
  }

  await kv.set("config:upi", { vpa, name, amount, phone: phone || null, extra });
  return {};
}

/* The public shape of the entry fee. Same object the admin saved, but read through a
   guard so a half-written config can't put the site into a paid state. */
async function publicUpi() {
  const upi = await kv.get("config:upi");
  return upi?.vpa && upi.amount > 0
    ? {
        vpa: upi.vpa,
        name: upi.name,
        amount: upi.amount,
        phone: upi.phone || null,
        extra: upi.extra || {},
      }
    : null;
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
  // Admin edits have to be visible on the very next read; a cached copy would make a
  // saved UPI ID look like it never saved.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      const whatsappLink = await kv.get("config:whatsapp_link");
      return res.status(200).json({
        whatsappLink: whatsappLink || "https://chat.whatsapp.com/",
        registrationOpen: await isRegistrationOpen(),
        tournament: (await kv.get("config:tournament")) || {},
        upi: await publicUpi(),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { whatsappLink, registrationOpen, tournament, room, upi, adminKey } = req.body || {};

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
      if (room !== undefined) {
        const { error } = await saveRoom(room);
        if (error) return res.status(400).json({ error });
      }
      if (upi !== undefined) {
        const { error } = await saveUpi(upi);
        if (error) return res.status(400).json({ error });
      }
      return res.status(200).json({
        ok: true,
        registrationOpen: await isRegistrationOpen(),
        tournament: (await kv.get("config:tournament")) || {},
        upi: await publicUpi(),
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
