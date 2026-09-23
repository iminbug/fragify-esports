import { kv } from "@vercel/kv";
import { matchKeys, normalizeMatchId, getMatch, getAllMatches, activeRegistrations } from "../lib/matches.js";

const MAPS = ["Erangel", "Miramar", "Rondo"];
const PLACEMENT_POINTS = { 1: 10, 2: 6, 3: 5, 4: 4, 5: 3, 6: 2, 7: 1, 8: 1 };

function numberInRange(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function rankResults(rows) {
  return rows
    .map((row) => {
      const maps = MAPS.map((map) => row.maps?.[map] || { placement: 0, kills: 0 });
      const kills = maps.reduce((total, item) => total + item.kills, 0);
      const placementPoints = maps.reduce((total, item) => total + (PLACEMENT_POINTS[item.placement] || 0), 0);
      const chickenDinners = maps.filter((item) => item.placement === 1).length;
      const bestPlacement = Math.min(...maps.map((item) => item.placement || 99));
      return { ...row, kills, placementPoints, points: kills + placementPoints, chickenDinners, bestPlacement };
    })
    .sort((a, b) =>
      b.points - a.points || b.chickenDinners - a.chickenDinners || b.kills - a.kills || a.bestPlacement - b.bestPlacement || a.team.localeCompare(b.team)
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const matchId = normalizeMatchId(req.query?.matchId);
    if (matchId) {
      const results = await kv.get(matchKeys.results(matchId));
      return res.status(200).json({ results: results || null });
    }
    let latest = null;
    for (const match of await getAllMatches()) {
      const results = await kv.get(matchKeys.results(match.id));
      if (results?.publishedAt && (!latest || results.publishedAt > latest.publishedAt)) latest = results;
    }
    return res.status(200).json({ results: latest });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!process.env.ADMIN_KEY || req.body?.adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const matchId = normalizeMatchId(req.body?.matchId);
    const match = matchId ? await getMatch(matchId) : null;
    if (!match) return res.status(400).json({ error: "Pick a valid match" });
    const registrations = await activeRegistrations(matchId);
    const bySlot = new Map(registrations.map((registration) => [Number(registration.slot_number), registration]));
    const rows = [];
    for (const raw of Array.isArray(req.body?.rows) ? req.body.rows : []) {
      const registration = bySlot.get(Number(raw.slot));
      if (!registration) return res.status(400).json({ error: "A result team no longer belongs to this match" });
      const maps = {};
      for (const map of MAPS) {
        const placement = numberInRange(raw.maps?.[map]?.placement, 1, match.totalSlots);
        const kills = numberInRange(raw.maps?.[map]?.kills, 0, 100);
        if (placement === null || kills === null) {
          return res.status(400).json({ error: `${map} requires a placement and kills for every team` });
        }
        maps[map] = { placement, kills };
      }
      rows.push({ slot: Number(registration.slot_number), team: registration.team_name, maps });
    }
    const ranked = rankResults(rows);
    const results = { matchId, matchName: match.name, maps: MAPS, leaderboard: ranked.slice(0, 8), publishedAt: new Date().toISOString() };
    await kv.set(matchKeys.results(matchId), results);
    return res.status(200).json({ ok: true, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}