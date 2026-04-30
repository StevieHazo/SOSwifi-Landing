import Stripe from "stripe";
import { redis } from "../lib/redis.js";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

    const input = req.method === "GET" ? req.query : (req.body || {});
    const priceId = String(input.priceId || "").trim();
    const sessionId = String(input.session || "").trim();

    if (!priceId) return res.status(400).json({ error: "Missing priceId" });
    if (!sessionId) return res.status(400).json({ error: "Missing session" });

    const baseUrl = String(process.env.BASE_URL || "").trim();
    if (!baseUrl) return res.status(500).json({ error: "Missing BASE_URL" });

    // 🔥 Get real MAC/IP from Redis (stored in FAS)
    const client = await redis.get(`client:${sessionId}`);

    const mac = client?.mac || sessionId;
    const ip = client?.ip || "";

    const stripeSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { mac, ip, priceId },
      client_reference_id: mac,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
    });

    if (req.method === "GET") {
      return res.redirect(303, stripeSession.url);
    }

    return res.status(200).json({ url: stripeSession.url });

  } catch (err) {
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}
