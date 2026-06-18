import Stripe from "stripe";
import { redis } from "../lib/redis.js";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

function safe(v) {
  return String(v || "").trim();
}

export default async function handler(req, res) {
  try {
    const input = req.method === "GET" ? req.query : req.body;

    const priceId = safe(input.priceId);
    const eventMode = safe(input.event) || "cheap";
    if (eventMode === "cheap") {
    const PLAN_MAP = {
  "price_1TM8LkF9howUJR6PV4Ezswak": "p5",
  "price_1TM8LkF9howUJR6PDVPAl0qe": "p6",
};
    }
    else
    {
 const PLAN_MAP = {
  "price_1TM8LkF9howUJR6PV4Ezswak": "p1",
  "price_1TM8LkF9howUJR6PDVPAl0qe": "p2",
  "price_1TM8LkF9howUJR6PlQUXWWkr": "p3",
};
    }
const plan = PLAN_MAP[priceId] || "p1";
    const sessionId = safe(input.session);
    const baseUrl = safe(process.env.BASE_URL);

    if (!priceId || !sessionId) {
      return res.status(400).json({ error: "Missing params" });
    }

    const client = await redis.get(`client:${sessionId}`);
    if (!client) {
      return res.status(400).json({ error: "Invalid session" });
    }

    const metadata = {
      sessionId,
      ip: client.ip,
      mac: client.mac || ""
    };
    await redis.set(`plan:session:${sessionId}`, plan, { ex: 3600 });
// 🔥 TEST MODE - skip Stripe
/*await redis.set(`paid:session:${sessionId}`, "paid", { ex: 3600 });

if (client.ip) {
  await redis.set(`paid:ip:${client.ip}`, sessionId, { ex: 3600 });
}

return res.status(200).json({
  url: `${baseUrl}/success?session=${sessionId}`
});*/
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: sessionId,
      metadata,
      success_url: `${baseUrl}/success?session=${sessionId}`,
      cancel_url: `${baseUrl}/cancel`
    });

    return res.status(200).json({ url: checkoutSession.url });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
