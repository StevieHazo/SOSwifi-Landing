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

    let authaction = safe(req.query.authaction);
    let tok = safe(req.query.tok);
    let clientip = "";
    let sessionId = safe(req.query.session);

    // 🔴 CASE 1: FIRST HIT (from router)
    if (!sessionId) {
      clientip = safe(authaction.match(/clientip=([^&]+)/)?.[1]);

      if (!authaction || !tok || !clientip) {
        return res.status(200).send("Missing params");
      }

      sessionId = makeSessionId(clientip);

      // store client
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

      // 🔁 redirect to portal (IMPORTANT: 302)
      return res.redirect(
        302,
        `https://soswifi.uk/?session=${sessionId}`
      );
    }

    // 🔴 CASE 2: AFTER PAYMENT (/api/fas?session=...)
    const client = await redis.get(`client:${sessionId}`);
    if (!client) {
      return res.status(200).send("Invalid session");
    }

    authaction = client.authaction;
    tok = client.tok;
    clientip = client.ip;

    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = await redis.get(`paid:ip:${clientip}`);

    // ✅ PAID → AUTHENTICATE (HTML, NOT 302)
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

    // ❌ NOT PAID → back to portal
    return res.redirect(
      302,
      `https://soswifi.uk/?session=${sessionId}`
    );

  } catch (err) {
    return res.status(500).send("FAS error");
  }
}
