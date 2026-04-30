import Stripe from "stripe";
import { redis } from "../lib/redis.js";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return res.status(405).send("Method Not Allowed");
    }

    if (!webhookSecret) {
      return res.status(500).send("Missing STRIPE_WEBHOOK_SECRET");
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
      return res.status(400).send("Missing Stripe signature");
    }

    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const sessionId = String(session.metadata?.sessionId || session.client_reference_id || "").trim();

      if (sessionId) {
        const client = await redis.get(`client:${sessionId}`);
        if (client) {
          const data = typeof client === "string" ? JSON.parse(client) : client;
          await redis.set(
            `client:${sessionId}`,
            {
              ...data,
              status: "paid",
              paidAt: Date.now(),
              stripeSessionId: session.id
            },
            { ex: 86400 }
          );
        }
      }
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err?.message || "Unknown error"}`);
  }
}
