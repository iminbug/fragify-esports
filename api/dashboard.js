import { getMatch, getUserRegistrations } from "../lib/matches.js";
import { findRegistration } from "../lib/team-auth.js";
import { sessionFromRequest } from "../lib/session.js";

/* The centralized fix for "the community link never reaches the team": once a
   captain is signed in, this is the one place that gathers every team they've
   registered — across every match — and hands back everything that team is
   entitled to see right now, including the WhatsApp invite the moment it's
   unlocked. Nothing here depends on an admin remembering to message anyone. */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Sign in with Google first" });

  try {
    const entries = await getUserRegistrations(session.email);
    const teams = [];

    for (const { matchId, slot } of entries) {
      const registration = await findRegistration(matchId, slot);
      // A cancelled or reset registration stays in the index until it's pruned
      // elsewhere; skip anything that no longer exists rather than erroring out.
      if (!registration || registration.email !== session.email) continue;

      const match = await getMatch(matchId);
      const paymentStatus = registration.payment_status || "verified";
      const approved = registration.approval_status !== "pending";

      teams.push({
        teamId: registration.team_id,
        teamName: registration.team_name,
        matchId,
        matchName: match ? match.name : matchId,
        matchTime: match ? match.matchTime : "",
        slot: registration.slot_number,
        paymentStatus,
        approved,
        checkedIn: Boolean(registration.checked_in_at),
        // Only handed over once both gates are clear — see api/payment.js for why.
        waLink: paymentStatus === "verified" && approved ? match?.whatsappLink || null : null,
        roomLive: Boolean(match && paymentStatus === "verified" && approved),
        entryFeePending: paymentStatus === "pending" || paymentStatus === "submitted",
      });
    }

    teams.sort((a, b) => a.matchId.localeCompare(b.matchId) || a.slot - b.slot);
    return res.status(200).json({ ok: true, user: { email: session.email, name: session.name, picture: session.picture }, teams });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
