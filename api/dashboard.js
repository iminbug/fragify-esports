import { kv } from "@vercel/kv";
import { getMatch, getUserRegistrations, matchKeys, activeRegistrations, writeRegistration } from "../lib/matches.js";
import { findRegistration, parseTeamId } from "../lib/team-auth.js";
import { sessionFromRequest } from "../lib/session.js";

/* The centralized fix for "the community link never reaches the team": once a
   captain is signed in, this is the one place that gathers every team they've
   registered — across every match — and hands back everything that team is
   entitled to see right now, including the WhatsApp invite the moment it's
   unlocked. Nothing here depends on an admin remembering to message anyone. */

function normalizeTeamName(name) {
  return String(name).trim().replace(/\s+/g, " ").toLowerCase();
}

/* A captain renaming their own team — the one self-service edit a team can make
   without an admin, gated the same way every other write here is: the session's
   email has to match the email the registration was made under. */
async function renameTeam(req, res, session) {
  const { teamId, teamName } = req.body || {};
  const parsed = parseTeamId(teamId);
  if (!parsed) return res.status(400).json({ error: "Invalid Team ID" });

  const registration = await findRegistration(parsed.matchId, parsed.slot);
  if (!registration || registration.email !== session.email) {
    return res.status(403).json({ error: "This team isn't linked to your account" });
  }

  const trimmed = String(teamName || "").trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 50) {
    return res.status(400).json({ error: "Team name must be 2-50 characters" });
  }

  const list = await activeRegistrations(parsed.matchId);
  const normalized = normalizeTeamName(trimmed);
  const clash = list.some(
    (r) => Number(r.slot_number) !== parsed.slot && normalizeTeamName(r.team_name) === normalized
  );
  if (clash) return res.status(409).json({ error: "This team name is already registered for this match" });

  const updated = await writeRegistration(parsed.matchId, parsed.slot, { ...registration, team_name: trimmed });
  return res.status(200).json({ ok: true, teamName: updated.team_name });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({ error: "Sign in with Google first" });

  if (req.method === "POST") {
    try {
      return await renameTeam(req, res, session);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const entries = await getUserRegistrations(session.email);
    const teams = [];
    // One results lookup per match, not per team — a captain with several teams
    // in the same lobby shouldn't cost extra reads.
    const resultsCache = new Map();

    for (const { matchId, slot } of entries) {
      const registration = await findRegistration(matchId, slot);
      // A cancelled or reset registration stays in the index until it's pruned
      // elsewhere; skip anything that no longer exists rather than erroring out.
      if (!registration || registration.email !== session.email) continue;

      const match = await getMatch(matchId);
      const paymentStatus = registration.payment_status || "verified";
      const approved = registration.approval_status !== "pending";

      if (!resultsCache.has(matchId)) {
        resultsCache.set(matchId, await kv.get(matchKeys.results(matchId)));
      }
      const results = resultsCache.get(matchId);
      const leaderboardRow = results?.leaderboard?.find(
        (row) => Number(row.slot) === Number(registration.slot_number)
      );

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
        // Only ever set once an admin has published that match's top 8 — most
        // teams most of the time will simply have none of this.
        rank: leaderboardRow?.rank ?? null,
        points: leaderboardRow?.points ?? null,
      });
    }

    teams.sort((a, b) => a.matchId.localeCompare(b.matchId) || a.slot - b.slot);
    return res.status(200).json({ ok: true, user: { email: session.email, name: session.name, picture: session.picture }, teams });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
