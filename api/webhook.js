import Stripe from "stripe";
import { buffer } from "micro";
import { redis } from "../lib/redis.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  const sig = req.headers["stripe-signature"];

  let event;

  try {
    const buf = await buffer(req); // 🔥 REQUIRED FIX

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

    const mac = session.metadata?.mac;

    if (mac) {
      await redis.set(`mac:${mac}`, "paid", { ex: 3600 });
    }
  }

  res.status(200).json({ received: true });
}
