import { redis } from "../lib/redis.js";

export default async function handler(req, res) {
  const mac = String(req.query.mac || "").trim();

  if (!mac) {
    return res.status(400).json({ ok: false, error: "Missing mac" });
  }

  const status = await redis.get(`mac:${mac}`);
  return res.status(200).json({ ok: status === "paid" });
}
