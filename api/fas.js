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

    // 🔹 Extract required params (Level 4)
 let authaction = safe(req.query.authaction);
let tok = safe(req.query.tok);
let clientip = "";

// If params missing → try from stored session
const sessionId = safe(req.query.session);

if ((!authaction || !tok) && sessionId) {
  const client = await redis.get(`client:${sessionId}`);
  if (client) {
    authaction = client.authaction;
    tok = client.tok;
    clientip = client.ip;
  }
} else {
  clientip = safe(authaction.match(/clientip=([^&]+)/)?.[1]);
}

if (!authaction || !tok || !clientip) {
  return res.status(200).send("Missing params");
}

    // 🔹 Stable session (IP based)
    const sessionId = makeSessionId(clientip);

    // 🔹 Store client
    await redis.set(`client:${sessionId}`, {
      sessionId,
      ip: clientip,
      tok,
      authaction,
      gatewayname,
      createdAt: Date.now()
    }, { ex: 3600 });

    await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });

    // 🔹 Check payment
    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = await redis.get(`paid:ip:${clientip}`);

    // ✅ IF PAID → AUTHENTICATE
    if (paidSession === "paid" || paidIP) {
      return res.redirect(302, `${authaction}&tok=${tok}`);
    }

    // ❌ NOT PAID → SEND TO PORTAL
    return res.redirect(
      302,
      `https://soswifi.uk/?session=${sessionId}`
    );

  } catch (err) {
    return res.status(500).send("FAS error");
  }
}
