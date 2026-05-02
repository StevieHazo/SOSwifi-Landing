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
    if (req.method === "POST") {
      return res.status(200).send("*");
    }

    if (req.method !== "GET") {
      return res.status(405).send("Method Not Allowed");
    }

    // 🔹 Extract ONLY what is reliable
    const authaction = safe(req.query.authaction);
    const tok = safe(req.query.tok);
    const gatewayname = safe(req.query.gatewayname);

    // 🔹 Extract IP from authaction (MAIN SOURCE)
    const clientip = safe(
      authaction.match(/clientip=([^&]+)/)?.[1]
    );

    // 🔴 Hard fail if no IP (avoid broken sessions)
    if (!clientip) {
      return res.status(200).send("Missing IP");
    }

    // 🔹 Stable session (IP + token)
    const sessionId = makeSessionId(`${clientip}|${tok}`);

    // 🔹 Store client
    const clientRecord = {
      sessionId,
      ip: clientip,
      tok,
      gatewayname,
      createdAt: Date.now()
    };

    await redis.set(`client:${sessionId}`, clientRecord, { ex: 3600 });
    await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });

    // 🔹 Check payment
    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = await redis.get(`paid:ip:${clientip}`);

    // ✅ IF PAID → RELEASE TO INTERNET (IMPORTANT)
    if (paidSession === "paid" || paidIP) {
      return res.redirect(302, "http://neverssl.com/");
    }

    // ❌ NOT PAID → go to portal
    return res.redirect(
      302,
      `https://soswifi.uk/?session=${sessionId}`
    );

  } catch (err) {
    return res.status(500).send("FAS error");
  }
}
