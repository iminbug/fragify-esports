import { kv } from "@vercel/kv";
import { authenticateTeam } from "../lib/team-auth.js";

/* Room credentials go only to teams that registered *and* paid, so this endpoint checks
   the Team ID and password issued at registration before returning anything. The public
   slots endpoint only ever says whether a room is live. */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // Credentials are per-team and time-limited — never let a proxy hold on to them.
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { teamId, password } = req.body || {};

  try {
    const auth = await authenticateTeam(teamId, password);
    if (auth.error) return res.status(auth.status).json({ error: auth.error });

    const registration = auth.registration;
    // Free tournaments predate the payment field; an absent status means nothing
    // was ever owed.
    const status = registration.payment_status || "verified";
    if (status !== "verified") {
      return res.status(402).json({
        error: status === "submitted"
          ? "Wait for your payment to be verified — an admin is checking it"
          : "Pay the entry fee first, then the room details will open up",
        paymentStatus: status,
      });
    }

    const room = await kv.get("config:room");
    const secondsLeft = room?.expiresAt
      ? Math.ceil((room.expiresAt - Date.now()) / 1000)
      : 0;

    return res.status(200).json({
      ok: true,
      team: registration.team_name,
      // null when nothing is posted yet — the team is verified, the room just
      // isn't open, and the UI says so instead of showing an error.
      room: room?.id && secondsLeft > 0
        ? { id: room.id, password: room.password, secondsLeft }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
