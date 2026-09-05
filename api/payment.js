import { authenticateTeam } from "../lib/team-auth.js";
import { getMatch, writeRegistration } from "../lib/matches.js";
import { notifyUtrSubmitted } from "../lib/notify.js";

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
    /* The fee, the room and the invite all belong to the team's own match — the Team
       ID names which one, and getMatch reads that match's config. */
    const match = await getMatch(auth.matchId);
    const upi = match?.entryFee || null;

    // A UTR in the body means "I've paid" — otherwise this is just a status check.
    if (utr !== undefined && utr !== null && String(utr).trim() !== "") {
      const reference = String(utr).trim().toUpperCase();
      if (!UTR_PATTERN.test(reference)) {
        return res.status(400).json({
          error: "A UTR contains only letters and numbers (usually 12 digits)",
        });
      }
      if (registration.payment_status === "verified") {
        return res.status(409).json({ error: "Payment already verified" });
      }

      registration = await writeRegistration(auth.matchId, auth.slot, {
        ...registration,
        utr: reference,
        payment_status: "submitted",
        // The clock stops once the team has done its part; from here an admin
        // decides, so the slot must not lapse underneath them.
        payment_deadline: null,
        submitted_at: new Date().toISOString(),
      });

      /* Tell the organiser, but only after the write has landed — if the alert is what
         fails, the UTR is already saved and still shows up in the admin panel.

         Awaited rather than left dangling: a serverless function is frozen the instant
         it responds, so a fire-and-forget promise here would simply never run. The
         result is deliberately ignored; a team that has genuinely paid must not see its
         submission rejected because Meta was slow or a token had expired. */
      await notifyUtrSubmitted({
        team: registration.team_name,
        match: match ? match.name : auth.matchId,
        // The match id rides inside the slot field so the WhatsApp template keeps its
        // approved five variables — slot #07 alone could be any lobby.
        slot: `${auth.matchId} #${String(registration.slot_number).padStart(2, "0")}`,
        phone: registration.phone,
        utr: reference,
        amount: upi?.amount ? `₹${upi.amount}` : "—",
      });
    }

    const deadline = registration.payment_deadline;
    const status = registration.payment_status || "verified";

    /* The community invite is the payoff for a settled slot, so it is read only once
       the fee is verified — a pending or submitted team never has it in its response
       and so has nothing to find in the network tab either. */
    const waLink = status === "verified" ? match?.whatsappLink || null : null;

    return res.status(200).json({
      ok: true,
      team: registration.team_name,
      teamId: registration.team_id,
      slot: registration.slot_number,
      match: match
        ? { id: match.id, name: match.name, matchTime: match.matchTime }
        : { id: auth.matchId, name: auth.matchId, matchTime: "" },
      // Registrations made before entry fees existed have no status — they were
      // never asked to pay, so treat them as settled.
      status,
      utr: registration.utr || null,
      waLink,
      holdSecondsLeft:
        typeof deadline === "number"
          ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
          : null,
      entryFee: upi
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
