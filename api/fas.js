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

function buildFinalAuthUrl({ authaction, tok, redir, custom = "p1" }) {
  // Append to original authaction, do NOT rebuild from base
  return `${authaction}&tok=${encodeURIComponent(tok)}&redir=${encodeURIComponent(redir)}&custom=${encodeURIComponent(custom)}`;
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
      const finalAuthUrl = buildFinalAuthUrl({
        authaction,
        tok,
        redir,
        custom: "p1"
      });

      res.setHeader("Content-Type", "text/html");
      res.setHeader("Cache-Control", "no-store");

      return res.send(`
        <html>
          <head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="text-align:center; font-family:sans-serif; padding:50px 20px;">
            <h2 style="color:#2ecc71;">Payment Verified!</h2>
            <p>Your 1-hour session is ready.</p>
            <a href="${finalAuthUrl}" 
               style="display:inline-block; margin-top:20px; padding:20px 40px; background:#2ecc71; color:white; text-decoration:none; border-radius:10px; font-weight:bold; font-size:1.2rem;">
               START BROWSING
            </a>
            <p style="margin-top:30px; font-size:0.8rem; color:#666;">Clicking the button will activate your internet and close this window.</p>
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
