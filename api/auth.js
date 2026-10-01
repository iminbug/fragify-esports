import { verifyGoogleIdToken } from "../lib/google-verify.js";
import { createSession } from "../lib/session.js";

/* Exchanges a Google Sign-In credential (ID token from the client-side button) for
   our own session token. Team captains authenticate with their Google account from
   here on — this endpoint is the only place a Google token is ever checked. */

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { idToken } = req.body || {};
  if (!idToken) return res.status(400).json({ error: "Missing Google credential" });

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).json({ error: "Google sign-in is not configured on this server" });

  try {
    const profile = await verifyGoogleIdToken(idToken, clientId);
    const token = createSession(profile);
    return res.status(200).json({
      ok: true,
      token,
      user: { email: profile.email, name: profile.name, picture: profile.picture },
    });
  } catch (err) {
    return res.status(401).json({ error: "Could not verify Google sign-in" });
  }
}
