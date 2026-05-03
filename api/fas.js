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

function buildFinalAuthUrl({ authaction, tok, redir }) {
  const joiner = authaction.includes("?") ? "&" : "?";
  return `${authaction}${joiner}tok=${encodeURIComponent(tok)}&redir=${encodeURIComponent(redir)}&custom=`;
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

    // CASE 1: first hit from openNDS router
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

      return res.redirect(
        302,
        `https://soswifi.uk/?session=${encodeURIComponent(sessionId)}`
      );
    }

    // CASE 2: later hit using stored session
    const client = await redis.get(`client:${sessionId}`);
    if (!client) {
      return res.status(200).send("Invalid session");
    }

    const clientip = safe(client.ip);
    const authaction = safe(client.authaction);
    const tok = safe(client.tok);
    const redir = safe(client.redir || "https://soswifi.uk/success");

    const paidSession = await redis.get(`paid:session:${sessionId}`);
    const paidIP = clientip ? await redis.get(`paid:ip:${clientip}`) : null;

    // PAID -> send to openNDS auth URL
    if (paidSession === "paid" || paidIP) {
      const finalAuthUrl = buildFinalAuthUrl({
        authaction,
        tok,
        redir
      });

      return res.redirect(302, finalAuthUrl);
    }

    // NOT PAID -> back to portal
    return res.redirect(
      302,
      `https://soswifi.uk/?session=${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    return res.status(500).send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
