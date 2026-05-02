import Stripe from "stripe";
import { redis } from "../lib/redis.js";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

function safe(v) {
  return String(v || "").trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

    const input = req.method === "GET" ? req.query : (req.body || {});
    const priceId = safe(input.priceId);
    const sessionId = safe(input.session);
    const baseUrl = safe(process.env.BASE_URL || process.env.BASEURL);

    if (!baseUrl.startsWith("http")) {
      return res.status(500).json({
        error: "BASE_URL must include https:// (e.g. https://soswifi.uk)"
      });
    }

    if (!priceId) return res.status(400).json({ error: "Missing priceId" });
    if (!sessionId) return res.status(400).json({ error: "Missing session" });

    const client = await redis.get(`client:${sessionId}`);
    if (!client) {
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    const ip = safe(client.ip || client.clientip);
    const mac = safe(client.mac || client.clientmac);

    if (!ip) {
      return res.status(400).json({ error: "Session missing client IP" });
    }
    // 🔥 TEST MODE (remove later)
await redis.set(`paid:session:${sessionId}`, "paid", { ex: 3600 });

if (ip) {
  await redis.set(`paid:ip:${ip}`, sessionId, { ex: 3600 });
}

if (mac) {
  await redis.set(`auth:mac:${mac}`, "paid", { ex: 3600 });
}

// Skip Stripe → go directly to success
return res.status(200).json({
  url: `${baseUrl}/success?session=${sessionId}`
});
/*
const metadata = {
      sessionId,
      priceId,
      ip,
      ...(mac ? { mac } : {})
    };

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      client_reference_id: sessionId,
      metadata,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`
    });

    if (!checkoutSession.url) {
      return res.status(500).json({
        error: "Stripe did not return checkout URL"
      });
    }

    return res.status(200).json({ url: checkoutSession.url }); */
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Internal Server Error"
    });
  }
}
