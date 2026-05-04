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

  // ✅ NEW: check if plan exists
  const planRaw = await redis.get(`plan:ip:${ip}`);
  let plan = null;

  try {
    plan = planRaw ? JSON.parse(planRaw) : null;
  } catch {
    plan = null;
  }

  // ✅ If plan exists → use Phase 6 logic
  if (linkedSession && plan && plan.speed && plan.expiry) {
    const now = Date.now();
    const remaining = Math.floor((plan.expiry - now) / 1000);

    // expired
    if (remaining <= 0) {
      await redis.del(`plan:ip:${ip}`);
      await redis.del(`paid:ip:${ip}`);
      return res.status(200).json({ ok: false });
    }

    return res.status(200).json({
      ok: true,
      sessiontimeout: remaining,
      uploadrate: plan.speed,
      downloadrate: plan.speed
    });
  }

  // ✅ fallback → old behavior (VERY IMPORTANT)
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
