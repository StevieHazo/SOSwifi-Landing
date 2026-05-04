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
    const url = new URL(authaction);
    return safe(url.searchParams.get("clientip"));
  } catch {
    return safe(authaction.match(/clientip=([^&]+)/)?.[1]);
  }
}

function extractAuthBase(authaction) {
  try {
    const url = new URL(authaction);
    return `${url.origin}${url.pathname}`;
  } catch {
    return safe(String(authaction).split("?")[0]);
  }
}

function buildFinalAuthUrl({ authaction, tok, redir, downloadrate, uploadrate, sessiontimeout }) {
  const base = extractAuthBase(authaction);
  // We pack limits into 'custom' separated by commas
  const custom = `${downloadrate},${uploadrate},${sessiontimeout}`;
  return `${base}?tok=${encodeURIComponent(tok)}&redir=${encodeURIComponent(redir)}&custom=${custom}`;
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

    let sessionId = safe(req.query.session);

    // First hit from openNDS
    if (!sessionId) {
      const authaction = safe(req.query.authaction);
      const tok = safe(req.query.tok);
      const redir = safe(req.query.redir);
      const gatewayname = safe(req.query.gatewayname);
      const clientip = extractClientIp(authaction);

      if (!authaction || !tok || !redir || !clientip) {
        return res.status(200).send("Missing params");
      }

      sessionId = makeSessionId(clientip);

      const clientRecord = {
        sessionId,
        ip: clientip,
        tok,
        redir,
        authaction,
        gatewayname,
        createdAt: Date.now()
      };

      await redis.set(`client:${sessionId}`, clientRecord, { ex: 3600 });
      await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });

      res.setHeader("Cache-Control", "no-store");
      return res.redirect(
        302,
        `https://soswifi.uk/?session=${encodeURIComponent(sessionId)}`
      );
    }

    // Return after payment / later revisit
    const client = await redis.get(`client:${sessionId}`);
    if (!client) {
      return res.status(200).send("Invalid session");
    }

    const clientip = safe(client.ip);
    const authaction = safe(client.authaction);
    const tok = safe(client.tok);
    const redir = safe(client.redir);

    if (!clientip || !authaction || !tok || !redir) {
      return res.status(200).send("Incomplete session");
    }

    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = clientip ? await redis.get(`paid:ip:${clientip}`) : null;

    if (paidSession === "paid" || paidIP) {
       const planRaw = await redis.get(`plan:ip:${clientip}`);
  let plan = planRaw ? JSON.parse(planRaw) : null;

  // Dynamic values from Redis
  const drate = plan?.speed || 5000;
  const urate = plan?.speed || 5000;
  let timeout = 1200; 

  if (plan?.expiry) {
    timeout = Math.max(60, Math.floor((plan.expiry - Date.now()) / 1000));
  }

  // Pack them into the custom field for the Binauth script
  const customStr = `${timeout},${drate},${urate}`;
  const finalAuthUrl = `${extractAuthBase(authaction)}?tok=${tok}&redir=${redir}&custom=${customStr}`;

  res.setHeader("Content-Type", "text/html");
  return res.send(`
    <html>
      <body style="text-align:center; padding:50px;">
        <h2>Payment Verified!</h2>
        <a href="${finalAuthUrl}" style="background:#2ecc71; color:white; padding:20px; text-decoration:none; border-radius:10px; font-weight:bold;">
           START BROWSING
        </a>
      </body>
    </html>
  `);
    }

    res.setHeader("Cache-Control", "no-store");
    return res.redirect(
      302,
      `https://soswifi.uk/?session=${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    return res.status(500).send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
