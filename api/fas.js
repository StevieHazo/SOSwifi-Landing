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

function decodeFasBuffer(input) {
  const raw = String(input || "").trim();

  const tryBase64 = (() => {
    const s = raw.replace(/ /g, "+").replace(/-/g, "+").replace(/_/g, "/");
    const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
    return Buffer.from(padded, "base64");
  })();

  if (tryBase64.length > 0 && raw.length % 4 === 0) {
    return tryBase64;
  }

  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
    return Buffer.from(raw, "hex");
  }

  return Buffer.from(raw, "utf8");
}

function decodeIv(rawIv) {
  const raw = String(rawIv || "").trim();

  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length === 32) {
    return Buffer.from(raw, "hex");
  }

  const b64 = decodeFasBuffer(raw);
  if (b64.length === 16) return b64;

  const hex = Buffer.from(raw, "hex");
  if (hex.length === 16) return hex;

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 16) return utf8;

  throw new Error(`Invalid IV length: ${b64.length}/${hex.length}/${utf8.length} raw=${raw}`);
}

function decodeFasLevel3(fas, iv, secret) {
  const ivBuf = decodeIv(iv);
  const fasBuf = decodeFasBuffer(fas);

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    getKey(secret),
    ivBuf
  );

  let decrypted = decipher.update(fasBuf);
  decrypted = Buffer.concat([decrypted, decipher.final()]).toString("utf8");

  return parseFasPayload(decrypted);
}

function randomSession() {
  return crypto.randomBytes(16).toString("hex");
}

export default async function handler(req, res) {
  try {
    const fas = String(req.query.fas || "").trim();
    const iv = String(req.query.iv || "").trim();
    const secret = String(process.env.FAS_KEY || "").trim();
    const baseUrl = String(process.env.BASE_URL || "").trim();

    if (!fas || !iv) return res.status(400).send("Missing fas or iv");
    if (!secret) return res.status(500).send("Missing FAS_KEY");
    if (!baseUrl) return res.status(500).send("Missing BASE_URL");

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
