import { redis } from "../lib/redis.js";

function safe(v) {
  return String(v || "").trim();
}

export default async function handler(req, res) {
  const mac = safe(req.query.mac);
  const sessionId = safe(req.query.session);
  const ip = safe(req.query.ip);

  // ✅ 1. Primary: session (unchanged)
  if (sessionId) {
    const paid = await redis.get(`paid:session:${sessionId}`);
    if (paid === "paid") {
      return res.status(200).json({ ok: true });
    }
  }

  // ✅ 2. MAC (unchanged)
  if (mac) {
    const paid = await redis.get(`auth:mac:${mac}`);
    if (paid === "paid") {
      return res.status(200).json({ ok: true });
    }
  }

  // ✅ 3. IP आधारित control (MAIN LOGIC)
  if (ip) {
    const sessionDataRaw = await redis.get(`paid:ip:${ip}`);
let sessionData = null;

try {
  sessionData = typeof sessionDataRaw === "string"
    ? JSON.parse(sessionDataRaw)
    : sessionDataRaw;
} catch {
  sessionData = null;
}
    // 🔥 Phase 6 logic (after payment)
    if (sessionData && sessionData.speed && sessionData.expiry) {
      const now = Date.now();
      const remaining = Math.floor((sessionData.expiry - now) / 1000);

      // ❌ expired
      if (remaining <= 0) {
        await redis.del(`paid:ip:${ip}`);
        return res.status(200).json({ ok: false });
      }

      // ✅ valid session → apply speed + time
      return res.status(200).json({
        ok: true,
        sessiontimeout: remaining,
        uploadrate: sessionData.speed,
        downloadrate: sessionData.speed
      });
    }

    // 🔥 IMPORTANT: fallback (pre-payment / legacy flow)
    if (sessionData) {
      return res.status(200).json({
        ok: true,
        sessiontimeout: 300,
        uploadrate: 1500,
        downloadrate: 1500
      });
    }
  }

  // ❌ Not authorized
  return res.status(200).json({ ok: false });
}
