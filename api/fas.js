import crypto from "crypto";
import { redis } from "../lib/redis.js";

function safe(v) {
  return String(v || "").trim();
}

function makeSessionId(input) {
  return crypto
    .createHash("sha256")
    .update(String(input))
    .digest("hex")
    .slice(0, 32);
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).send("Method Not Allowed");
    }

    const authaction = safe(req.query.authaction);
    const tok = safe(req.query.tok);
    const redir = safe(req.query.redir || "http://neverssl.com/");
    const gatewayname = safe(req.query.gatewayname);

    const clientipMatch = authaction.match(/clientip=([^&]+)/);
    const clientip = safe(clientipMatch ? decodeURIComponent(clientipMatch[1]) : "");

    if (!authaction || !clientip) {
      return res.status(200).send("Missing params");
    }

    const sessionId = makeSessionId(clientip);

    await redis.set(`client:${sessionId}`, {
      sessionId,
      clientip,
      authaction,
      tok,
      redir,
      gatewayname,
      createdAt: Date.now()
    }, { ex: 3600 });

    await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });

    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = await redis.get(`paid:ip:${clientip}`);

    /*if (paidSession === "paid" || paidIP) {
      const joiner = authaction.includes("?") ? "&" : "?";
      const finalAuthUrl =
        `${authaction}${joiner}tok=${encodeURIComponent(tok)}&redir=${encodeURIComponent(redir)}`;

      return res.redirect(302, finalAuthUrl);
    }*/

    return res.redirect(302, `https://soswifi.uk/?session=${encodeURIComponent(sessionId)}`);
  } catch (err) {
    return res.status(500).send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
