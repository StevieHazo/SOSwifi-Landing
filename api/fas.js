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
  // openNDS 9.8 reads these specific URL parameters
  return `${base}?tok=${encodeURIComponent(tok)}&redir=${encodeURIComponent(redir)}` +
         `&downloadrate=${downloadrate || 0}` +
         `&uploadrate=${uploadrate || 0}` +
         `&sessiontimeout=${sessiontimeout || 0}`;
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
       // 1. Get the plan using the client IP
  const planRaw = await redis.get(`plan:ip:${clientip}`);
  let plan = planRaw ? JSON.parse(planRaw) : null;

  // 2. Calculate limits (fallback to 5Mbps/5mins if plan missing)
  const downloadrate = plan?.speed || 5000;
  const uploadrate = plan?.speed || 5000;
  let sessiontimeout = 300; 

  if (plan?.expiry) {
    sessiontimeout = Math.floor((plan.expiry - Date.now()) / 1000);
  }
  if (sessiontimeout <= 0) sessiontimeout = 60; // Safety floor

  // 3. Build the URL with the new limits
  const finalAuthUrl = buildFinalAuthUrl({ 
    authaction, 
    tok, 
    redir,
    downloadrate,
    uploadrate,
    sessiontimeout
  });

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
