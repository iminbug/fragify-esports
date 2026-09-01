import { kv } from "@vercel/kv";
import { writeRegistration } from "../lib/team-auth.js";

/* Removes a team entirely and frees its seat. All three keys have to go, especially the
   phone one — otherwise that number could never register again. */
async function cancelRegistration(slot) {
  const list = (await kv.get("registrations:list")) || [];
  const target = Array.isArray(list)
    ? list.find((r) => Number(r?.slot_number) === slot)
    : null;
  if (!target) return false;

  await kv.set("registrations:list", list.filter((r) => Number(r?.slot_number) !== slot));
  await kv.del(`registrations:${slot}`);
  if (target.phone) await kv.del(`registrations:phone:${target.phone}`);
  return true;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { action, slot: rawSlot, adminKey } = req.body || {};

  // Distinguish "server has no key configured" from "wrong key" — otherwise a
  // missing env var looks identical to a typo and is painful to diagnose.
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: "Admin key is not configured on the server" });
  }
  if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    if (action === "list") {
      const regList = (await kv.get("registrations:list")) || [];
      return res.status(200).json({ registrations: regList });
    }

    if (action === "reset") {
      const regList = (await kv.get("registrations:list")) || [];
      for (const reg of regList) {
        await kv.del(`registrations:phone:${reg.phone}`);
        await kv.del(`registrations:${reg.slot_number}`);
      }
      await kv.del("registrations:list");
      return res.status(200).json({ ok: true });
    }

    // Everything below acts on one team.
    if (action === "verify" || action === "reject" || action === "cancel") {
      const slot = Number(rawSlot);
      if (!Number.isInteger(slot)) {
        return res.status(400).json({ error: "A slot number is required" });
      }

      if (action === "cancel") {
        const removed = await cancelRegistration(slot);
        if (!removed) return res.status(404).json({ error: "No team in that slot" });
        return res.status(200).json({ ok: true });
      }

      const registration = await kv.get(`registrations:${slot}`);
      if (!registration) return res.status(404).json({ error: "No team in that slot" });

      if (action === "verify") {
        await writeRegistration(slot, {
          ...registration,
          payment_status: "verified",
          payment_deadline: null,
          verified_at: new Date().toISOString(),
        });
      } else {
        // Rejecting hands the slot back to the team rather than deleting it — the
        // usual cause is a mistyped UTR, and re-registering would lose their squad.
        await writeRegistration(slot, {
          ...registration,
          payment_status: "pending",
          utr: null,
          payment_deadline: Date.now() + 20 * 60 * 1000,
        });
      }
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
