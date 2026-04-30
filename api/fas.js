import crypto from "crypto";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_KV_URL,
  token: process.env.UPSTASH_KV_REST_API_TOKEN,
});

// helper to derive 32-byte key
function getKey(key) {
  return crypto.createHash("sha256").update(key).digest();
}

function decodeFas(fas, key) {
  const raw = Buffer.from(fas, "base64");

  const iv = raw.subarray(0, 16);
  const encrypted = raw.subarray(16);

  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    getKey(key),
    iv
  );

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString());
}

export default async function handler(req, res) {
  try {
    const { fas } = req.query;

    if (!fas) {
      return res.redirect("https://soswifi.uk/?error=missing_fas");
    }

    const key = process.env.FAS_KEY; // MUST match router

    const data = decodeFas(fas, key);

    const mac = data.clientmac;
    const ip = data.clientip;

    if (!mac) {
      return res.redirect("https://soswifi.uk/?error=no_mac");
    }

    // store in redis
    await redis.set(`client:${mac}`, {
      mac,
      ip,
      ts: Date.now(),
      status: "pending",
    });

    return res.redirect(`https://soswifi.uk/?session=${encodeURIComponent(mac)}`);

  } catch (err) {
    return res.redirect("https://soswifi.uk/?error=fas_decode_failed");
  }
}
