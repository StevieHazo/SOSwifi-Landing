import crypto from "crypto";
import { redis } from "../lib/redis.js";

const FASKEY =
  process.env.FAS_KEY || "9f3b7c2e8a1d4f6b0c9e5a7d2b8c1f3e";

function safe(v) {
  return String(v || "").trim();
}

function parseFasPayload(fas) {
  try {
    const decoded = Buffer.from(String(fas || ""), "base64").toString("utf8");
    const obj = {};

    decoded.split(", ").forEach((pair) => {
      const i = pair.indexOf("=");
      if (i > -1) {
        const key = pair.slice(0, i).trim();
        const value = pair.slice(i + 1).trim();
        obj[key] = value;
      }
    });

    return obj;
  } catch {
    return {};
  }
}

function makeSessionId(input) {
  return crypto
    .createHash("sha256")
    .update(String(input))
    .digest("hex")
    .slice(0, 32);
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
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

    const rawFas = safe(req.query.fas);
    const parsed = rawFas ? parseFasPayload(rawFas) : {};

    const clientip = safe(parsed.clientip || req.query.clientip);
    const clientmac = safe(parsed.clientmac || req.query.clientmac);
    const gatewayname = safe(parsed.gatewayname || req.query.gatewayname);
    const gatewayaddress = safe(parsed.gatewayaddress || req.query.gatewayaddress);
    const originurl = safe(parsed.originurl || req.query.originurl);
    const clientif = safe(parsed.clientif || req.query.clientif);
    const authdir = safe(parsed.authdir || req.query.authdir);
    const hid = safe(
      parsed.client_hid ||
      parsed.clienthid ||
      parsed.hid ||
      req.query.hid
    );
    const tok = safe(parsed.tok || req.query.tok);

   const sessionId = makeSessionId(
  [clientip, tok].join("|")
);

    const rhid = hid ? sha256(hid + FASKEY) : "";

    const clientRecord = {
      sessionId,
      hid,
      rhid,
      tok,
      clientip,
      ip: clientip,
      clientmac,
      mac: clientmac,
      gatewayname,
      gatewayaddress,
      originurl,
      clientif,
      authdir,
      paid: false,
      createdAt: Date.now()
    };

    await redis.set(`client:${sessionId}`, clientRecord, { ex: 3600 });

    if (clientip) {
      await redis.set(`clientip:${clientip}`, sessionId, { ex: 3600 });
    }

    const alreadyPaidSession = await redis.get(`paid:session:${sessionId}`);
    const alreadyPaidIP = clientip ? await redis.get(`paid:ip:${clientip}`) : null;

  if (alreadyPaidSession === "paid" || alreadyPaidIP) {
  return res.status(200).send("OK");
}

    return res.redirect(
      302,
      `/?session=${encodeURIComponent(sessionId)}`
    );
  } catch (err) {
    return res
      .status(500)
      .send(`FAS error: ${err?.message || "Unknown error"}`);
  }
}
