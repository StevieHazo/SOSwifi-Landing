import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

    const input = req.method === "GET" ? req.query : req.body || {};

    const priceId = input.priceId;
    const mac = input.mac || "";
    const ip = input.ip || "";

    if (!priceId) {
      return res.status(400).send("Missing priceId");
    }

    const baseUrl = process.env.BASE_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        mac,
        ip,
        priceId,
      },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
    });

    if (req.method === "GET") {
      return res.redirect(303, session.url);
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
