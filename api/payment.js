import { kv } from "@vercel/kv";
import { authenticateTeam, writeRegistration } from "../lib/team-auth.js";

/* A team checks its own payment status here, and submits the UTR from its UPI app.
   Everything is behind the Team ID + password issued at registration, so nobody can
   look up — or pay on behalf of — someone else's slot. */

/* UPI reference numbers are 12 digits, but banks and apps show variations, so accept a
   sane alphanumeric range rather than rejecting a valid receipt on a strict pattern. */
const UTR_PATTERN = /^[A-Za-z0-9]{6,24}$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { teamId, password, utr } = req.body || {};

  try {
    const auth = await authenticateTeam(teamId, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    let registration = auth.registration;

    // A UTR in the body means "I've paid" — otherwise this is just a status check.
    if (utr !== undefined && utr !== null && String(utr).trim() !== "") {
      const reference = String(utr).trim().toUpperCase();
      if (!UTR_PATTERN.test(reference)) {
        return res.status(400).json({
          error: "UTR sirf numbers/letters ka hota hai (aam taur par 12 digit)",
        });
      }
      if (registration.payment_status === "verified") {
        return res.status(409).json({ error: "Payment already verified" });
      }

      registration = await writeRegistration(auth.slot, {
        ...registration,
        utr: reference,
        payment_status: "submitted",
        // The clock stops once the team has done its part; from here an admin
        // decides, so the slot must not lapse underneath them.
        payment_deadline: null,
        submitted_at: new Date().toISOString(),
      });
    }

    const upi = (await kv.get("config:upi")) || null;
    const deadline = registration.payment_deadline;

    return res.status(200).json({
      ok: true,
      team: registration.team_name,
      teamId: registration.team_id,
      slot: registration.slot_number,
      // Registrations made before entry fees existed have no status — they were
      // never asked to pay, so treat them as settled.
      status: registration.payment_status || "verified",
      utr: registration.utr || null,
      holdSecondsLeft:
        typeof deadline === "number"
          ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
          : null,
      entryFee: upi?.vpa && upi.amount > 0
        ? {
            vpa: upi.vpa,
            name: upi.name,
            amount: upi.amount,
            phone: upi.phone || null,
            // Merchant-QR signature parameters; without them the paying app
            // refuses a link-started payment to a merchant VPA.
            extra: upi.extra || {},
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
