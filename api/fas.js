import { redis } from "../lib/redis.js";

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      return res.status(200).send("*");
    }

    if (req.method !== "GET") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

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
