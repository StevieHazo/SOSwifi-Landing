import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET, POST");
      return res.status(405).send("Method Not Allowed");
    }

    const input = req.method === "GET" ? req.query : (req.body || {});
    const priceId = String(input.priceId || "").trim();
    const mac = String(input.mac || "").trim();
    const ip = String(input.ip || "").trim();

    if (!priceId) return res.status(400).json({ error: "Missing priceId" });
    if (!mac) return res.status(400).json({ error: "Missing mac" });
    if (!ip) return res.status(400).json({ error: "Missing ip" });

    const baseUrl = String(process.env.BASE_URL || "").trim();
    if (!baseUrl) return res.status(500).json({ error: "Missing BASE_URL" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { mac, ip, priceId },
      client_reference_id: mac,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cancel`,
    });

    if (req.method === "GET") return res.redirect(303, session.url);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Internal Server Error" });
  }
}
