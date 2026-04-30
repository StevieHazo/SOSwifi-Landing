import { redis } from "../lib/redis.js";

function safe(v) {
  return String(v || "").trim();
}

export default async function handler(req, res) {
  const mac = safe(req.query.mac);
  const sessionId = safe(req.query.session);
  const ip = safe(req.query.ip);

  if (sessionId) {
    const paid = await redis.get(`paid:session:${sessionId}`);
    return res.status(200).json({ ok: paid === "paid" });
  }

  if (mac) {
    const paid = await redis.get(`mac:${mac}`);
    return res.status(200).json({ ok: paid === "paid" });
  }

  if (ip) {
    const linkedSession = await redis.get(`paid:ip:${ip}`);
    return res.status(200).json({ ok: !!linkedSession, session: linkedSession || null });
  }

  return res.status(400).json({ ok: false, error: "Missing session, mac, or ip" });
}
