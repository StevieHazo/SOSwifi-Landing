import Stripe from "stripe";
import { buffer } from "micro";
import { redis } from "../lib/redis.js";

export const config = {
  api: {
    bodyParser: false
  }
};

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

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
    const mac = String(session.metadata?.mac || "").trim();
    const ip = String(session.metadata?.ip || "").trim();
    const sessionId = String(session.metadata?.sessionId || "").trim();
    const priceId = String(session.metadata?.priceId || "").trim();

    if (mac) {
      await redis.set(`mac:${mac}`, "paid", { ex: 3600 });
    }

    if (sessionId) {
      await redis.set(
        `payment:${sessionId}`,
        JSON.stringify({
          status: "paid",
          mac,
          ip,
          priceId,
          stripeSessionId: session.id,
          paidAt: Date.now()
        }),
        { ex: 86400 }
      );
    }
  }

  return res.status(200).json({ received: true });
}
