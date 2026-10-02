import { kv } from "@vercel/kv";
import { notifyPlayerReport } from "../lib/notify.js";

/* Match-day fair-play reports: any visitor can flag a player, no sign-in required —
   requiring an account here would just mean genuine reports never get filed. Admin
   actions (list/resolve/delete) are the only things gated by the admin key. */

const REPORTS_KEY = "reports:list";
const MAX_REPORTS = 200;
const MAX_FIELD_LEN = 60;
const MAX_REASON_LEN = 400;

function clean(value, max) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { action, id, adminKey } = req.body || {};
    const isAdmin = Boolean(process.env.ADMIN_KEY) && adminKey === process.env.ADMIN_KEY;

    if (req.method === "GET" || action === "list") {
      if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
      const list = (await kv.get(REPORTS_KEY)) || [];
      return res.status(200).json({ reports: Array.isArray(list) ? list : [] });
    }

    if (action === "resolve" || action === "delete") {
      if (!isAdmin) return res.status(401).json({ error: "Unauthorized" });
      const list = (await kv.get(REPORTS_KEY)) || [];
      const updated = action === "delete"
        ? list.filter((r) => r.id !== id)
        : list.map((r) => (r.id === id ? { ...r, status: "resolved" } : r));
      await kv.set(REPORTS_KEY, updated);
      return res.status(200).json({ ok: true });
    }

    // Anything else on POST is a new report from the public.
    const { matchId, matchName, reporterTeam, reportedPlayer, reason } = req.body || {};
    const cleanedPlayer = clean(reportedPlayer, MAX_FIELD_LEN);
    const cleanedReason = clean(reason, MAX_REASON_LEN);
    if (cleanedPlayer.length < 2) {
      return res.status(400).json({ error: "Enter the reported player's IGN" });
    }
    if (cleanedReason.length < 10) {
      return res.status(400).json({ error: "Describe what happened (at least 10 characters)" });
    }

    const report = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      matchId: clean(matchId, 20) || null,
      matchName: clean(matchName, MAX_FIELD_LEN) || null,
      reporterTeam: clean(reporterTeam, MAX_FIELD_LEN) || "Anonymous",
      reportedPlayer: cleanedPlayer,
      reason: cleanedReason,
      createdAt: new Date().toISOString(),
      status: "open",
    };

    const list = (await kv.get(REPORTS_KEY)) || [];
    list.unshift(report);
    // Newest-first, capped so this key can never grow without bound.
    await kv.set(REPORTS_KEY, list.slice(0, MAX_REPORTS));

    await notifyPlayerReport({
      match: report.matchName || report.matchId || "—",
      reporterTeam: report.reporterTeam,
      reportedPlayer: report.reportedPlayer,
      reason: report.reason,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
