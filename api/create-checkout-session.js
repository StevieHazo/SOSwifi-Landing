import Stripe from "stripe";
import { redis } from "../lib/redis.js";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

const PRICE_MAP = {
  basic: "price_1TM8LkF9howUJR6PV4Ezswak",
  standard: "price_1TM8LkF9howUJR6PDVPAl0qe",
  deluxe: "price_1TM8LkF9howUJR6PlQUXWWkr"
};

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

    const input = req.method === "GET" ? req.query : (req.body || {});
    const sessionId = String(input.session || "").trim();
    const plan = String(input.plan || "").trim();
    const priceId = String(input.priceId || PRICE_MAP[plan] || "").trim();
    const baseUrl = String(process.env.BASE_URL || "").trim();

    if (!sessionId) return res.status(400).json({ error: "Missing session" });
    if (!priceId) return res.status(400).json({ error: "Missing priceId" });
    if (!baseUrl) return res.status(500).json({ error: "Missing BASE_URL" });

    const client = await redis.get(`client:${sessionId}`);
    if (!client || !client.mac) {
      return res.status(400).json({ error: "Invalid or expired session" });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: sessionId,
      metadata: {
        sessionId,
        mac: String(client.mac || "").trim(),
        ip: String(client.ip || "").trim(),
        priceId
      },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`
    });

    if (req.method === "GET") {
      return res.redirect(303, checkoutSession.url);
    }

    return res.status(200).json({ url: checkoutSession.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}
