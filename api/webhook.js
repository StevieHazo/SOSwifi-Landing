import Stripe from "stripe";
import { redis } from "../lib/redis.js";

export const config = {
  api: { bodyParser: false }
};

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

// 🔥 Map Stripe price → speed + duration
function getPlan(priceId) {
  switch (priceId) {
    case "price_1TM8LkF9howUJR6PV4Ezswak":   // TODO replace with real ID
      return { speed: 5000, duration: 300 }; // 5 Mbps, 20 mins
    case "price_1TM8LkF9howUJR6PDVPAl0qe":  // TODO replace
      return { speed: 15000, duration: 300 };
    case "price_1TM8LkF9howUJR6PlQUXWWkr":  // TODO replace
      return { speed: 25000, duration: 300 };
    default:
      return null;
  }
}

export default async function handler(req, res) {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
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
    const priceId = String(session.metadata?.priceId || "").trim();

    const plan = getPlan(priceId);

    if (!plan) {
      return res.status(400).send("Invalid plan");
    }

    const expiryTs = Date.now() + plan.duration * 1000;

    // ✅ Store enhanced IP session (MAIN SOURCE)
    if (ip) {
      await redis.set(
  `paid:ip:${ip}`,
  JSON.stringify({
    sessionId,
    speed: plan.speed,
    expiry: expiryTs
  }),
  { ex: plan.duration }
);
    }

    // ✅ Keep existing keys (for backward compatibility)
    if (sessionId) {
      await redis.set(`paid:session:${sessionId}`, "paid", { ex: plan.duration });
    }

    if (mac) {
      await redis.set(`auth:mac:${mac}`, "paid", { ex: plan.duration });
    }

    // ✅ Update client record
    if (sessionId) {
      const client = await redis.get(`client:${sessionId}`);
      if (client) {
        const updatedClient = {
          ...client,
          paid: true,
          paidAt: Date.now(),
          speed: plan.speed,
          expiry: expiryTs
        };
        await redis.set(`client:${sessionId}`, updatedClient, { ex: plan.duration });
      }
    }
  }

  return res.status(200).json({ received: true });
}
