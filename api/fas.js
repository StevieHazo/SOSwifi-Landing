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

    // 🔹 Extract params
    let authaction = safe(req.query.authaction);
    let tok = safe(req.query.tok);
    let clientip = "";
    let sessionId = safe(req.query.session); // ✅ only declared once

    // 🔹 If coming after payment → fetch from Redis
    if ((!authaction || !tok) && sessionId) {
      const client = await redis.get(`client:${sessionId}`);
      if (client) {
        authaction = client.authaction;
        tok = client.tok;
        clientip = client.ip;
      }
    } else {
      clientip = safe(authaction.match(/clientip=([^&]+)/)?.[1]);
      sessionId = makeSessionId(clientip); // ✅ assign, not redeclare
    }

    if (!authaction || !tok || !clientip) {
      return res.status(200).send("Missing params");
    }

    // 🔹 Store client
    await redis.set(
      `client:${sessionId}`,
      {
        sessionId,
        ip: clientip,
        tok,
        authaction,
        createdAt: Date.now()
      },
      { ex: 3600 }
    );

    await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });

    // 🔹 Check payment
    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = await redis.get(`paid:ip:${clientip}`);

    // ✅ PAID → AUTHENTICATE
    if (paidSession === "paid" || paidIP) {
     return res.status(200).send(`
<html>
<head>
<script>
  window.location.href = "${authaction}&tok=${tok}";
</script>
</head>
<body>Connecting...</body>
</html>
`);
    }

    // ❌ NOT PAID → PORTAL
    return res.redirect(
      302,
      `https://soswifi.uk/?session=${sessionId}`
    );

  } catch (err) {
    return res.status(500).send("FAS error");
  }
}
