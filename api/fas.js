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
  
  // openNDS v9.8 internal parameter names:
  // sessionlength: minutes (NOT seconds)
  // uploadrate: kb/s
  // downloadrate: kb/s
  
  const minutes = Math.max(1, Math.floor(sessiontimeout / 60));

  return `${base}?tok=${encodeURIComponent(tok)}` +
         `&redir=${encodeURIComponent(redir)}` +
         `&sessionlength=${minutes}` +
         `&uploadrate=${uploadrate || 0}` +
         `&downloadrate=${downloadrate || 0}`;
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
       // Pull plan from Redis (or use defaults)
  const planRaw = await redis.get(`plan:ip:${clientip}`);
  const plan = planRaw ? JSON.parse(planRaw) : { speed: 5000, expiry: Date.now() + 1200000 };

  const drate = plan.speed;
  const timeout = Math.max(60, Math.floor((plan.expiry - Date.now()) / 1000));
  
  // Format: timeout,download,upload (comma-separated, NO spaces)
  const customStr = `${timeout},${drate},${drate}`;
  
  // Construct the URL
  const finalAuthUrl = `${extractAuthBase(authaction)}?tok=${tok}&redir=${encodeURIComponent(redir)}&custom=${customStr}`;

  res.setHeader("Content-Type", "text/html");
  return res.send(`
    <html>
      <body style="text-align:center; padding:50px 20px; font-family:sans-serif; background:#0f172a; color:white;">
        <h2>Payment Verified!</h2>
        <a href="${finalAuthUrl}" 
           style="display:inline-block; margin-top:20px; padding:20px 40px; background:#10b981; color:white; text-decoration:none; border-radius:10px; font-weight:bold;">
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
