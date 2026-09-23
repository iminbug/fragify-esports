import { authenticateTeam } from "../lib/team-auth.js";
import { getMatch, writeRegistration } from "../lib/matches.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { teamId, password } = req.body || {};
  try {
    const auth = await authenticateTeam(teamId, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const registration = auth.registration;
    if ((registration.payment_status || "verified") !== "verified") {
      return res.status(402).json({ error: "Payment must be verified before check-in" });
    }
    if (registration.approval_status === "pending") {
      return res.status(403).json({ error: "Admin approval is required before check-in" });
    }
    const match = await getMatch(auth.matchId);
    if (!match) return res.status(404).json({ error: "Match no longer exists" });

    const checkedInAt = registration.checked_in_at || new Date().toISOString();
    if (!registration.checked_in_at) {
      await writeRegistration(auth.matchId, auth.slot, { ...registration, checked_in_at: checkedInAt });
    }
    return res.status(200).json({ ok: true, team: registration.team_name, match: match.name, checkedInAt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}