import { redis } from "../lib/redis.js";

function safe(v) {
  return String(v || "").trim();
}

export default async function handler(req, res) {
  const mac = safe(req.query.mac);
  const sessionId = safe(req.query.session);
  const ip = safe(req.query.ip);

  // ✅ 1. Primary: session (keep for compatibility)
  if (sessionId) {
    const paid = await redis.get(`paid:session:${sessionId}`);
    if (paid === "paid") {
      // fallback (rarely used now)
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

  // ✅ 3. MAIN LOGIC → IP control
  if (ip) {
    const sessionData = await redis.get(`paid:ip:${ip}`);

    if (sessionData && sessionData.speed && sessionData.expiry) {
      const now = Date.now();
      const remaining = Math.floor((sessionData.expiry - now) / 1000);

      // ❌ expired
      if (remaining <= 0) {
        await redis.del(`paid:ip:${ip}`);
        return res.status(200).json({ ok: false });
      }

      // ✅ valid session
      return res.status(200).json({
        ok: true,
        sessiontimeout: remaining,          // seconds
        uploadrate: sessionData.speed,      // kbps
        downloadrate: sessionData.speed     // kbps
      });
    }
  }

  // ❌ Not authorized
  return res.status(200).json({ ok: false });
}
