import Stripe from "stripe";
import { redis } from "../lib/redis.js";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    // ✅ Native raw body (no micro)
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);

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

    if (sessionId) {
      await redis.set(`paid:session:${sessionId}`, "paid", { ex: 3600 });
    }

    if (ip) {
      await redis.set(`paid:ip:${ip}`, sessionId || "paid", { ex: 3600 });
    }

    if (mac) {
      await redis.set(`auth:mac:${mac}`, "paid", { ex: 3600 });
    }

    if (sessionId) {
      const client = await redis.get(`client:${sessionId}`);
      if (client) {
        const updatedClient = {
          ...client,
          paid: true,
          paidAt: Date.now()
        };
        await redis.set(`client:${sessionId}`, updatedClient, { ex: 3600 });
      }
    }
  }

  return res.status(200).json({ received: true });
}
