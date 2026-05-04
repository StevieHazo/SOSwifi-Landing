import { redis } from "../lib/redis.js";

function safe(v) {
  return String(v || "").trim();
}

export default async function handler(req, res) {
  const mac = safe(req.query.mac);
  const sessionId = safe(req.query.session);
  const ip = safe(req.query.ip);

  // ✅ 1. Primary: session
  if (sessionId) {
    const paid = await redis.get(`paid:session:${sessionId}`);
    if (paid === "paid") {
      return res.status(200).json({ ok: true });
    }
  }

  // ✅ 2. Secondary: MAC (normalized key)
  if (mac) {
    const paid = await redis.get(`auth:mac:${mac}`);
    if (paid === "paid") {
      return res.status(200).json({ ok: true });
    }
  }

  // ✅ 3. Fallback: IP
  if (ip) {
    const linkedSession = await redis.get(`paid:ip:${ip}`);
    if (linkedSession) {
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
