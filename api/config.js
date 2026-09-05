import { kv } from "@vercel/kv";
import { notifyUtrSubmitted, notifyConfigured } from "../lib/notify.js";
import {
  MAX_MATCHES,
  DEFAULT_TOTAL_SLOTS,
  DEFAULT_FIRST_SLOT,
  matchKeys,
  normalizeMatchId,
  getMatch,
  listMatchIds,
  nextMatchId,
  saveMatch,
  deleteMatch,
} from "../lib/matches.js";

/* Site-wide details an admin can edit from the panel. Anything left blank is dropped
   so the page can hide that tile instead of showing an empty one. */
const DETAIL_KEYS = [
  "date", "time", "maps", "slots", "entryFee",
  "prizePool", "prize1", "prize2", "prize3", "prize4", "prizeKills",
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

/* Room credentials are per match and deliberately short-lived: Redis drops the key on
   its own after ROOM_TTL_SECONDS, so a forgotten room ID can't sit on a public page
   all night. */
const ROOM_TTL_SECONDS = 10 * 60;
const MAX_ROOM_FIELD_LEN = 40;

async function saveRoom(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { error: "Room details must be an object" };
  }

  const matchId = normalizeMatchId(raw.matchId);
  if (!matchId || !(await getMatch(matchId))) {
    return { error: "Pick which match this room belongs to" };
  }

  // An explicit remove means "take it down now".
  if (raw.remove) {
    await kv.del(matchKeys.room(matchId));
    return {};
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
    matchKeys.room(matchId),
    { id, password, expiresAt: Date.now() + ROOM_TTL_SECONDS * 1000 },
    { ex: ROOM_TTL_SECONDS }
  );
  return {};
}

/* Entry fee. No fee on a match means a free match, which is why an explicit null has
   to be accepted — that is how an admin turns payments back off. */
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

/* Validates a match's entry fee and returns it, rather than writing it — the fee is a
   field on the match config, not a key of its own. */
function cleanUpi(raw) {
  if (raw === null) return { upi: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { error: "Entry fee settings must be an object" };
  }

  // A blank VPA and amount together mean "no fee" — that is how the match editor
  // clears a fee without a separate button.
  if (!String(raw.vpa ?? "").trim() && !String(raw.amount ?? "").trim()) {
    return { upi: null };
  }

  const { vpa, extra } = parsePayee(raw.vpa);
  if (!VPA_PATTERN.test(vpa)) {
    return { error: "A UPI ID looks like yourname@ybl (or paste the full QR link)" };
  }

  const amount = Number(raw.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT) {
    return { error: `Entry fee must be a whole rupee amount between 1 and ${MAX_AMOUNT}` };
  }

  const name = String(raw.name ?? "").trim().replace(/\s+/g, " ") || "Fragify Esports";
  if (name.length > MAX_PAYEE_NAME_LEN) {
    return { error: `Payee name must be under ${MAX_PAYEE_NAME_LEN} characters` };
  }

  // Optional. UPI apps refuse link-started payments to a personal VPA, so a number
  // teams can pay directly is the fallback that always works.
  const phone = String(raw.phone ?? "").replace(/\D/g, "");
  if (phone && phone.length !== 10) {
    return { error: "The UPI mobile number must be 10 digits" };
  }

  return { upi: { vpa, name, amount, phone: phone || null, extra } };
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

/* ---- Match create / update ---- */
const MAX_NAME_LEN = 60;
const MAX_TIME_LEN = 60;
const MAX_SLOTS = 100;
const MAX_FIRST_SLOT = 900;

/* Applies whatever fields the request carried on top of an existing (or default)
   match, validating each one. Absent fields are left alone, so a small edit never
   silently wipes the rest. */
function applyMatchFields(raw, existing) {
  const match = { ...existing };

  if (raw.name !== undefined) {
    const name = String(raw.name ?? "").trim().replace(/\s+/g, " ");
    if (!name) return { error: "The match needs a name, e.g. Evening Scrims" };
    if (name.length > MAX_NAME_LEN) {
      return { error: `Match name must be under ${MAX_NAME_LEN} characters` };
    }
    match.name = name;
  }

  if (raw.matchTime !== undefined) {
    const time = String(raw.matchTime ?? "").trim().replace(/\s+/g, " ");
    if (time.length > MAX_TIME_LEN) {
      return { error: `Match time must be under ${MAX_TIME_LEN} characters` };
    }
    match.matchTime = time;
  }

  if (raw.totalSlots !== undefined) {
    const total = Number(raw.totalSlots);
    if (!Number.isInteger(total) || total < 1 || total > MAX_SLOTS) {
      return { error: `Total slots must be between 1 and ${MAX_SLOTS}` };
    }
    match.totalSlots = total;
  }

  if (raw.firstSlot !== undefined) {
    const first = Number(raw.firstSlot);
    if (!Number.isInteger(first) || first < 1 || first > MAX_FIRST_SLOT) {
      return { error: `First slot number must be between 1 and ${MAX_FIRST_SLOT}` };
    }
    match.firstSlot = first;
  }

  if (raw.whatsappLink !== undefined) {
    const value = String(raw.whatsappLink ?? "").trim();
    if (!value) {
      match.whatsappLink = null;
    } else {
      const link = normalizeLink(value);
      if (!link) {
        return { error: "Enter a valid link, e.g. https://chat.whatsapp.com/..." };
      }
      match.whatsappLink = link;
    }
  }

  if (raw.upi !== undefined) {
    const { upi, error } = cleanUpi(raw.upi);
    if (error) return { error };
    match.entryFee = upi;
  }

  if (raw.registrationOpen !== undefined) {
    match.registrationOpen = Boolean(raw.registrationOpen);
  }

  return { match };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Admin edits have to be visible on the very next read; a cached copy would make a
  // saved match look like it never saved.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    try {
      return res.status(200).json({
        tournament: (await kv.get("config:tournament")) || {},
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const {
      tournament, room, testNotify, adminKey,
      createMatch: createRaw, updateMatch: updateRaw, deleteMatch: deleteRaw,
    } = req.body || {};

    if (!process.env.ADMIN_KEY) {
      return res.status(500).json({ error: "Admin key is not configured on the server" });
    }
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      /* An alert channel has a lot of ways to be almost-right: a token that expired
         overnight, a chat id off by a minus sign, a template name that doesn't match.
         With no way to try it, the first sign of trouble would be a missed alert on
         match day. So send a real alert with sample values and hand the provider's own
         error back verbatim — that error text is what makes it fixable in a minute. */
      if (testNotify) {
        if (!notifyConfigured()) {
          return res.status(400).json({
            error:
              "No alert channel is set up yet. Add TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID, " +
              "or NTFY_TOPIC, or DISCORD_WEBHOOK, in Vercel — then redeploy.",
          });
        }
        const result = await notifyUtrSubmitted({
          team: "Test Squad",
          match: "Test Match",
          slot: "M0 #00",
          phone: "9999999999",
          utr: "TESTUTR00000",
          amount: "₹0",
        });
        return result.ok
          ? res.status(200).json({
              ok: true,
              message:
                "Test alert sent via " +
                result.results.filter((r) => r.ok).map((r) => r.channel).join(", "),
            })
          : res.status(400).json({ error: result.error || "Could not send the test alert" });
      }

      if (createRaw !== undefined) {
        if (typeof createRaw !== "object" || createRaw === null) {
          return res.status(400).json({ error: "Match details must be an object" });
        }
        const ids = await listMatchIds();
        if (ids.length >= MAX_MATCHES) {
          return res.status(400).json({ error: `At most ${MAX_MATCHES} matches — delete an old one first` });
        }
        const defaults = {
          name: "",
          matchTime: "",
          totalSlots: DEFAULT_TOTAL_SLOTS,
          firstSlot: DEFAULT_FIRST_SLOT,
          whatsappLink: null,
          entryFee: null,
          registrationOpen: true,
        };
        const { match, error } = applyMatchFields({ name: "", ...createRaw }, defaults);
        if (error) return res.status(400).json({ error });
        match.id = await nextMatchId();
        match.createdAt = new Date().toISOString();
        await saveMatch(match);
        return res.status(200).json({ ok: true, match });
      }

      if (updateRaw !== undefined) {
        if (typeof updateRaw !== "object" || updateRaw === null) {
          return res.status(400).json({ error: "Match details must be an object" });
        }
        const existing = await getMatch(updateRaw.id);
        if (!existing) return res.status(404).json({ error: "No such match" });

        const { match, error } = applyMatchFields(updateRaw, existing);
        if (error) return res.status(400).json({ error });
        await saveMatch(match);
        return res.status(200).json({ ok: true, match });
      }

      if (deleteRaw !== undefined) {
        const match = await getMatch(deleteRaw);
        if (!match) return res.status(404).json({ error: "No such match" });
        await deleteMatch(match.id);
        return res.status(200).json({ ok: true });
      }

      if (room !== undefined) {
        const { error } = await saveRoom(room);
        if (error) return res.status(400).json({ error });
        return res.status(200).json({ ok: true });
      }

      if (tournament !== undefined) {
        const { tournament: cleaned, error } = cleanTournament(tournament);
        if (error) return res.status(400).json({ error });
        await kv.set("config:tournament", cleaned || {});
        return res.status(200).json({
          ok: true,
          tournament: (await kv.get("config:tournament")) || {},
        });
      }

      return res.status(400).json({ error: "Nothing to save" });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}
