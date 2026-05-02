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
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

    if (safe(req.query.status) === "authenticated") {
      return res.status(200).send("Already authenticated");
    }

    const authaction = safe(req.query.authaction);
    const tok = safe(req.query.tok);
    const redir = safe(req.query.redir) || "http://neverssl.com/";
    const gatewayname = safe(req.query.gatewayname);

    const clientip = safe(
      decodeURIComponent(authaction).match(/clientip=([^&]+)/)?.[1]
    );

    if (!clientip) {
      return res.status(200).send("Missing IP");
    }

    const sessionId = makeSessionId(clientip);

    const clientRecord = {
      sessionId,
      ip: clientip,
      clientip,
      tok,
      authaction,
      redir,
      gatewayname,
      createdAt: Date.now()
    };

    await redis.set(`client:${sessionId}`, clientRecord, { ex: 3600 });
    await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });

    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = await redis.get(`paid:ip:${clientip}`);

    if (paidSession === "paid" || paidIP) {
      if (!authaction || !tok) {
        return res.status(200).send("Missing auth params");
      }

      const joiner = authaction.includes("?") ? "&" : "?";
      const authUrl =
        `${authaction}${joiner}tok=${encodeURIComponent(tok)}` +
        `&redir=${encodeURIComponent(redir)}`;

      return res.redirect(302, authUrl);
    }

    return res.status(200).send(`
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting</title>
  <script>
    setTimeout(() => {
      window.location.href = "https://soswifi.uk/?session=${encodeURIComponent(sessionId)}";
    }, 300);
  </script>
</head>
<body>Redirecting...</body>
</html>
    `);
  } catch (err) {
    return res.status(500).send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
