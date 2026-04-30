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
    const baseUrl = String(process.env.BASE_URL || "").trim();

    if (!priceId) {
      return res.status(400).json({ error: "Missing priceId" });
    }

    if (!sessionId) {
      return res.status(400).json({ error: "Missing session" });
    }

    if (!baseUrl) {
      return res.status(500).json({ error: "Missing BASE_URL" });
    }

    const client = await redis.get(`client:${sessionId}`);

    if (!client || !client.mac) {
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    const mac = String(client.mac || "").trim();
    const ip = String(client.ip || "").trim();

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        mac,
        ip,
        priceId,
        sessionId
      },
      client_reference_id: mac,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`
    });

    if (req.method === "GET") {
      return res.redirect(303, checkoutSession.url);
    }

    return res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Internal Server Error"
    });
  }
}
