import crypto from "crypto";
import { redis } from "../lib/redis.js";

const FASKEY = process.env.FAS_KEY || "9f3b7c2e8a1d4f6b0c9e5a7d2b8c1f3e";

function parseFasPayload(fas) {
  const decoded = Buffer.from(String(fas || ""), "base64").toString("utf8");
  const obj = {};

  decoded.split(", ").forEach(pair => {
    const idx = pair.indexOf("=");
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      obj[key] = value;
    }
  });

  return obj;
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
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

    if (req.query.status === "authenticated") {
      return res.status(200).send("Already authenticated");
    }

    const fas = String(req.query.fas || "").trim();
    if (!fas) {
      return res.status(400).send("Missing fas");
    }

    const data = parseFasPayload(fas);

    const sessionId =
      String(data.client_hid || data.clienthid || data.hid || "").trim();

    if (!sessionId) {
      return res.status(400).send("Missing hid");
    }

    await redis.set(
      `client:${sessionId}`,
      {
        sessionId,
        clientip: String(data.clientip || "").trim(),
        clientmac: String(data.clientmac || "").trim(),
        gatewayname: String(data.gatewayname || "").trim(),
        gatewayaddress: String(data.gatewayaddress || "").trim(),
        authdir: String(data.authdir || "").trim(),
        originurl: String(data.originurl || "").trim(),
        clientif: String(data.clientif || "").trim(),
        hid: sessionId,
        paid: false,
        createdAt: Date.now()
      },
      { ex: 3600 }
    );

    return res.redirect(
      302,
      `/index.html?session=${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    return res.status(500).send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
