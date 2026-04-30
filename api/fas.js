import { redis } from "../lib/redis.js";

export default async function handler(req, res) {
  try {
    const session = String(req.query.session || "").trim();

    if (!session) {
      return res.status(400).send("Missing session");
    }

    const client = await redis.get(`client:${session}`);
    if (!client) {
      return res.status(404).send("Session not found");
    }

    return res.redirect(302, `/pay.html?session=${encodeURIComponent(session)}`);
  } catch (err) {
    return res.status(500).send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
