/* Alerts the organiser the moment a team submits its UTR.

   Four channels are supported. Whichever ones have their environment variables set
   will fire; the rest stay silent. Set none and the site behaves exactly as it did
   before — no alerts, no errors.

     Telegram   TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
     ntfy       NTFY_TOPIC
     Discord    DISCORD_WEBHOOK
     WhatsApp   WA_TOKEN + WA_PHONE_ID + WA_ADMIN_NUMBER

   Not the internal WhatsApp *group*, deliberately: WhatsApp exposes no API that can
   post into a group, and a chat.whatsapp.com invite is a join link, not an endpoint.
   Meta's Cloud API sends to individual numbers only. Telegram and ntfy are the two
   channels here that genuinely reach a group.

   Lives outside api/ on purpose: Vercel turns every .js file under api/ into a public
   route, and this one holds tokens. */

const GRAPH_VERSION = "v21.0";
// Long enough for a normal call, short enough that a hanging endpoint can't keep a
// paying team staring at a spinner.
const TIMEOUT_MS = 4000;

/* One flattened line per value. Meta rejects a template variable containing a newline,
   a tab, or four consecutive spaces, and a 200-character team name should not be the
   thing that bounces the whole alert. */
function cell(value, max = 60) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/* The five fields, in the order the WhatsApp template expects them. Exported so the
   admin panel's test button sends exactly the shape a real alert does — a test that
   takes a different path proves nothing. */
export function utrAlertFields(details) {
  return [
    cell(details.team),
    cell(details.slot, 8),
    cell(details.phone, 20),
    cell(details.utr, 32),
    cell(details.amount, 16),
  ];
}

/* The message every channel except WhatsApp sends. WhatsApp is the odd one out: it
   can only send a pre-approved template, so it gets the same values as variables. */
function alertText(details) {
  const [team, slot, phone, utr, amount] = utrAlertFields(details);
  return [
    "🔔 New payment submitted",
    "",
    `Team:   ${team}`,
    `Slot:   ${slot}`,
    `Phone:  ${phone}`,
    `UTR:    ${utr}`,
    `Amount: ${amount}`,
    "",
    "Verify it in the Fragify admin panel.",
  ].join("\n");
}

/* Every channel goes through here so one hanging endpoint can't hold the team's own
   response open, and so no channel can throw its way out onto the payment path. */
async function send(label, url, init, readError) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: abort.signal });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      const error = `${label}: ${readError(response.status, raw)}`;
      console.error("UTR alert failed —", error);
      return { channel: label, ok: false, error };
    }
    return { channel: label, ok: true };
  } catch (err) {
    const error = `${label}: ${err.name === "AbortError" ? "timed out" : err.message}`;
    console.error("UTR alert failed —", error);
    return { channel: label, ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

/* Pull the useful sentence out of a provider's error body. The body is never surfaced
   whole — it can echo parts of the request, and the request carries a phone number. */
function pluck(status, raw, ...paths) {
  try {
    const parsed = JSON.parse(raw);
    for (const path of paths) {
      const value = path.split(".").reduce((o, k) => (o == null ? o : o[k]), parsed);
      if (typeof value === "string" && value) return value;
    }
    const code = parsed?.error?.code;
    if (code) return `error code ${code}`;
  } catch {
    /* Not JSON — fall through to the bare status. */
  }
  return `HTTP ${status}`;
}

/* ---- Telegram: a bot token and a chat id, nothing to approve, nothing that expires.
   Posts into a group, which is the closest thing to what was originally wanted. ---- */
function telegram(details) {
  return send(
    "Telegram",
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // No parse_mode: a team name containing _ or * would otherwise break the
      // message, and Telegram would reject the whole thing over a stray underscore.
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: alertText(details),
      }),
    },
    (status, raw) => pluck(status, raw, "description")
  );
}

/* ---- ntfy: no account at all. Install the app, subscribe to a topic, done.
   The topic name is the only secret, so it needs to be an unguessable one. ---- */
function ntfy(details) {
  const server = (process.env.NTFY_SERVER || "https://ntfy.sh").replace(/\/+$/, "");
  const topic = String(process.env.NTFY_TOPIC).trim();
  return send(
    "ntfy",
    `${server}/${encodeURIComponent(topic)}`,
    {
      method: "POST",
      headers: {
        // ntfy reads these as latin-1, so the title and tags stay plain ASCII —
        // an emoji here comes out as mojibake. The body is UTF-8 and fine.
        Title: "New payment submitted",
        Tags: "moneybag",
        Priority: "high",
        "Content-Type": "text/plain; charset=utf-8",
      },
      body: alertText(details),
    },
    (status, raw) => pluck(status, raw, "error")
  );
}

/* ---- Discord: paste a webhook URL from the channel settings. That is the setup. ---- */
function discord(details) {
  return send(
    "Discord",
    process.env.DISCORD_WEBHOOK,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "```\n" + alertText(details) + "\n```" }),
    },
    (status, raw) => pluck(status, raw, "message")
  );
}

/* ---- WhatsApp via Meta's Cloud API. Real WhatsApp, but to one number rather than a
   group, and it needs an approved template plus a non-expiring System User token.

     WA_TOKEN         System User token (the API Setup page's token dies in 24 hours)
     WA_PHONE_ID      "Phone number ID" from WhatsApp > API Setup — the long numeric
                      id, not the phone number itself
     WA_ADMIN_NUMBER  where it lands, country code and no +, e.g. 919217191222
     WA_TEMPLATE      template name, default "utr_alert"
     WA_TEMPLATE_LANG language of that template, default "en_US" (Meta lists plain
                      "English" as en — a mismatch is the usual cause of code 132001) */
function whatsapp(details) {
  return send(
    "WhatsApp",
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WA_PHONE_ID}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.WA_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: String(process.env.WA_ADMIN_NUMBER).replace(/\D/g, ""),
        type: "template",
        template: {
          name: process.env.WA_TEMPLATE || "utr_alert",
          language: { code: process.env.WA_TEMPLATE_LANG || "en_US" },
          components: [
            {
              type: "body",
              parameters: utrAlertFields(details).map((text) => ({ type: "text", text })),
            },
          ],
        },
      }),
    },
    (status, raw) => pluck(status, raw, "error.message")
  );
}

/* `ready` is deliberately separate from `send`: asking whether a channel is set up
   must never be answered by actually sending something. */
const CHANNELS = [
  {
    ready: () => Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    send: telegram,
  },
  { ready: () => Boolean(String(process.env.NTFY_TOPIC || "").trim()), send: ntfy },
  { ready: () => Boolean(process.env.DISCORD_WEBHOOK), send: discord },
  {
    ready: () =>
      Boolean(process.env.WA_TOKEN && process.env.WA_PHONE_ID && process.env.WA_ADMIN_NUMBER),
    send: whatsapp,
  },
];

export function notifyConfigured() {
  return CHANNELS.some((channel) => channel.ready());
}

/* Returns a result rather than throwing. Callers on the payment path must not let an
   alert failure reject a team that has genuinely paid — the UTR is already saved and
   the admin panel lists it either way, so a missed alert is an inconvenience, not a
   lost payment.

   Every configured channel is tried, and they run together rather than one after the
   other: a slow Discord should not delay a Telegram message that was ready to go. */
export async function notifyUtrSubmitted(details) {
  const active = CHANNELS.filter((channel) => channel.ready());
  if (!active.length) {
    return { ok: false, skipped: true, error: "No alert channel is configured" };
  }

  const results = await Promise.all(active.map((channel) => channel.send(details)));
  const failures = results.filter((r) => !r.ok);
  return {
    // One channel getting through is a delivered alert; the others are redundancy.
    ok: failures.length < results.length,
    results,
    error: failures.length ? failures.map((r) => r.error).join(" · ") : undefined,
  };
}
