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

function extractClientIp(authaction) {
  try {
    const decoded = decodeURIComponent(authaction || "");
    return safe(decoded.match(/clientip=([^&]+)/)?.[1]);
  } catch {
    return "";
  }
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
    const redir = safe(req.query.redir) || "http://neverssl.com/";
    const gatewayname = safe(req.query.gatewayname);

    const clientip = extractClientIp(authaction);

    if (!clientip || !authaction) {
      return res.status(200).send("Missing params");
    }

    const sessionId = makeSessionId(clientip);

    const clientRecord = {
      sessionId,
      ip: clientip,
      clientip,
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
      return res.status(200).send(`
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Connecting</title>
  <script>
    setTimeout(() => {
      window.location.href = ${JSON.stringify(authaction)};
    }, 300);
  </script>
</head>
<body>Connecting...</body>
</html>
      `);
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
