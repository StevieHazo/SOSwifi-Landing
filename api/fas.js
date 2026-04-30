
import crypto from "crypto";
import { redis } from "../lib/redis.js";

function getKey(secret) {
  return crypto.createHash("sha256").update(secret).digest();
}

function parseFasPayload(str) {
  const out = {};
  for (const part of str.split(", ")) {
    const i = part.indexOf("=");
    if (i > -1) {
      const key = part.slice(0, i).trim();
      const value = part.slice(i + 1).trim();
      out[key] = value;
    }
  }
  return out;
}

function decodeAny(input) {
  const raw = String(input || "").trim();
  const hexLike = /^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0;
  if (hexLike) return Buffer.from(raw, "hex");
  const b64 = raw.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const buf = Buffer.from(padded, "base64");
  if (buf.length) return buf;
  return Buffer.from(raw, "utf8");
}

function decodeIv(iv) {
  const raw = String(iv || "").trim();

  if (/^[0-9a-fA-F]{32}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const asHex = /^[0-9a-fA-F]+$/.test(raw) ? Buffer.from(raw, "hex") : null;
  if (asHex && asHex.length === 16) return asHex;

  const asB64 = decodeAny(raw);
  if (asB64.length === 16) return asB64;

  const asUtf8 = Buffer.from(raw, "utf8");
  if (asUtf8.length === 16) return asUtf8;

  throw new Error(`Invalid IV length: ${raw} -> hex:${asHex?.length || 0} b64:${asB64.length} utf8:${asUtf8.length}`);
}

function decodeFasLevel3(fas, iv, secret) {
  const ivBuf = decodeIv(iv);
  const fasBuf = decodeAny(fas);

  if (ivBuf.length !== 16) {
    throw new Error(`Invalid IV length: ${ivBuf.length}`);
  }

  const decipher = crypto.createDecipheriv("aes-256-cbc", getKey(secret), ivBuf);
  let decrypted = decipher.update(fasBuf);
  decrypted = Buffer.concat([decrypted, decipher.final()]).toString("utf8");
  return parseFasPayload(decrypted);
}

function randomSession() {
  return crypto.randomBytes(16).toString("hex");
}

function authmonResponse(req, res) {
  const authGet = String(req.body?.auth_get || req.query?.auth_get || "").trim();
  const gatewayhash = String(req.body?.gatewayhash || req.query?.gatewayhash || "").trim();

  if (!authGet || !gatewayhash) {
    return res.status(200).send("*");
  }

  return res.status(200).send("*");
}

export default async function handler(req, res) {
  try {
    const secret = String(process.env.FAS_KEY || "").trim();
    const baseUrl = String(process.env.BASE_URL || "").trim();

    if (!secret) return res.status(500).send("Missing FAS_KEY");
    if (!baseUrl) return res.status(500).send("Missing BASE_URL");

    if (req.method === "POST") {
      return authmonResponse(req, res);
    }

    const fas = String(req.query.fas || "").trim();
    const iv = String(req.query.iv || "").trim();

    if (!fas || !iv) {
      return res.status(400).send("Missing fas or iv");
    }

    const data = decodeFasLevel3(fas, iv, secret);

    const mac = String(data.clientmac || "").trim();
    const ip = String(data.clientip || "").trim();

    if (!mac) {
      return res.status(400).send("Missing clientmac in FAS payload");
    }

    const session = randomSession();

    await redis.set(
      `client:${session}`,
      {
        mac,
        ip,
        ts: Date.now(),
        status: "pending"
      },
      { ex: 900 }
    );

    return res.redirect(302, `${baseUrl}/?session=${encodeURIComponent(session)}`);
  } catch (err) {
    return res.status(500).send(`FAS decode failed: ${err?.message || "Unknown error"}`);
  }
}
