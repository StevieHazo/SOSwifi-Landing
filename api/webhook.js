import Stripe from "stripe";
import { buffer } from "micro";
import { redis } from "../lib/redis.js";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(
      buf,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send("Webhook Error");
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const sessionId = String(session.metadata?.sessionId || "").trim();
    const ip = String(session.metadata?.ip || "").trim();
    const mac = String(session.metadata?.mac || "").trim();

    // ✅ Primary: session-based auth
    if (sessionId) {
      await redis.set(`paid:session:${sessionId}`, "paid", { ex: 3600 });
    }

    // ✅ Router binding (IP fallback)
    if (ip) {
      await redis.set(`paid:ip:${ip}`, sessionId || "paid", { ex: 3600 });
    }

    // ✅ Normalized MAC key (future-safe)
    if (mac) {
      await redis.set(`auth:mac:${mac}`, "paid", { ex: 3600 });
    }

    // ✅ Update stored client object
    if (sessionId) {
      const client = await redis.get(`client:${sessionId}`);
      if (client) {
        client.paid = true;
        client.paidAt = Date.now();
        await redis.set(`client:${sessionId}`, client, { ex: 3600 });
      }
    }
  }

  return res.status(200).json({ received: true });
}
