import {
  HOLD_MINUTES,
  normalizeMatchId,
  getMatch,
  getAllMatches,
  activeRegistrations,
  writeRegistration,
  cancelRegistration,
  resetMatchRegistrations,
} from "../lib/matches.js";
import { findRegistration } from "../lib/team-auth.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, matchId: rawMatchId, slot: rawSlot, adminKey } = req.body || {};

  // Distinguish "server has no key configured" from "wrong key" — otherwise a
  // missing env var looks identical to a typo and is painful to diagnose.
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: "Admin key is not configured on the server" });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    /* Everything about every match in one payload: the full config (fee included, so
       the editor can prefill it) plus the live roster. Admin-only, hence the key check
       above — this is the one response that carries phones and passwords. */
    if (action === "list") {
      const matches = [];
      for (const match of await getAllMatches()) {
        matches.push({
          ...match,
          registrations: await activeRegistrations(match.id),
        });
      }
      return res.status(200).json({ matches });
    }

    // Everything below acts on one match.
    const matchId = normalizeMatchId(rawMatchId);
    const match = matchId ? await getMatch(matchId) : null;
    if (!match) {
      return res.status(400).json({ error: "A match id is required" });
    }

    if (action === "reset") {
      await resetMatchRegistrations(match.id);
      return res.status(200).json({ ok: true });
    }

    // Everything below acts on one team.
    if (action === "verify" || action === "reject" || action === "cancel") {
      const slot = Number(rawSlot);
      if (!Number.isInteger(slot)) {
        return res.status(400).json({ error: "A slot number is required" });
      }

      if (action === "cancel") {
        const removed = await cancelRegistration(match.id, slot);
        if (!removed) return res.status(404).json({ error: "No team in that slot" });
        return res.status(200).json({ ok: true });
      }

      const registration = await findRegistration(match.id, slot);
      if (!registration) return res.status(404).json({ error: "No team in that slot" });

      if (action === "verify") {
        await writeRegistration(match.id, slot, {
          ...registration,
          payment_status: "verified",
          payment_deadline: null,
          verified_at: new Date().toISOString(),
        });
      } else {
        // Rejecting hands the slot back to the team rather than deleting it — the
        // usual cause is a mistyped UTR, and re-registering would lose their squad.
        await writeRegistration(match.id, slot, {
          ...registration,
          payment_status: "pending",
          utr: null,
          payment_deadline: Date.now() + HOLD_MINUTES * 60 * 1000,
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
