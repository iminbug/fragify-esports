/* Alerts the organiser on WhatsApp the moment a team submits its UTR.

   Not the internal WhatsApp *group*, deliberately: WhatsApp exposes no API that can
   post into a group, and a chat.whatsapp.com invite is a join link, not an endpoint.
   Meta's Cloud API sends to individual numbers only — so this goes to one organiser
   number, WA_ADMIN_NUMBER, and nowhere else.

   Lives outside api/ on purpose: Vercel turns every .js file under api/ into a public
   route, and this one holds the access token.

   Configured entirely by environment variable, so nothing here is a secret in git:
     WA_TOKEN         Meta access token (use a System User token — the 24-hour tester
                      token from the getting-started page expires overnight)
     WA_PHONE_ID      "Phone number ID" from the WhatsApp > API Setup screen — the long
                      numeric id, not the phone number itself
     WA_ADMIN_NUMBER  where the alert lands, country code and no +, e.g. 919217191222
     WA_TEMPLATE      template name, default "utr_alert"
     WA_TEMPLATE_LANG language code of that template, default "en_US" (Meta lists
                      plain "English" as en and "English (US)" as en_US — a mismatch
                      here is the usual cause of error 132001)

   Leave them unset and the site behaves exactly as it did before: no alerts, no errors. */

const GRAPH_VERSION = "v21.0";
// Long enough for a normal Graph call, short enough that a hanging Meta endpoint
// can't keep the paying team staring at a spinner.
const TIMEOUT_MS = 4000;

/* Meta rejects any template variable containing a newline, a tab, or four consecutive
   spaces, so every value is flattened to one line before it goes out. Capped as well:
   a 200-character team name should not be the thing that bounces the whole alert. */
function cell(value, max = 60) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "—";
  return text.length > max ? text.slice(0, max - 1) + "…" : text;
}

/* Meta's failures are JSON with an error object; surface just the message and code.
   The response is never logged whole — it can echo parts of the request, and the
   request carries a phone number. */
function describeFailure(status, raw) {
  try {
    const error = JSON.parse(raw)?.error;
    if (error?.message) {
      return `${error.message}${error.code ? ` (code ${error.code})` : ""}`;
    }
  } catch {
    /* Not JSON — fall through to the bare status. */
  }
  return `WhatsApp API returned ${status}`;
}

/* The five template variables, in the order the approved template expects them.
   Exported so the admin panel's test button sends exactly the shape a real alert
   does — a test that takes a different path proves nothing. */
export function utrAlertFields(details) {
  return [
    cell(details.team),
    cell(details.slot, 8),
    cell(details.phone, 20),
    cell(details.utr, 32),
    cell(details.amount, 16),
  ];
}

export function notifyConfigured() {
  return Boolean(
    process.env.WA_TOKEN && process.env.WA_PHONE_ID && process.env.WA_ADMIN_NUMBER
  );
}

/* Returns a result rather than throwing. Callers on the payment path must not let an
   alert failure reject a team that has genuinely paid — the UTR is already saved and
   the admin panel lists it either way, so a missed alert is an inconvenience, not a
   lost payment. */
export async function notifyUtrSubmitted(details) {
  const token = process.env.WA_TOKEN;
  const phoneId = process.env.WA_PHONE_ID;
  const to = String(process.env.WA_ADMIN_NUMBER || "").replace(/\D/g, "");
  // Unconfigured is a normal state, not a fault: the site ran a whole season without it.
  if (!token || !phoneId || !to) {
    return { ok: false, skipped: true, error: "WhatsApp alerts are not configured" };
  }

  const body = {
    messaging_product: "whatsapp",
    to,
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
  };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        signal: abort.signal,
      }
    );

    if (!response.ok) {
      const error = describeFailure(response.status, await response.text().catch(() => ""));
      console.error("UTR alert failed:", error);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err.name === "AbortError" ? "WhatsApp API timed out" : err.message;
    console.error("UTR alert failed:", error);
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}
