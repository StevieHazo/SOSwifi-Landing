import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_KEY_SECRET);

export default async function handler(req, res) {
  try {
    let priceId;

    // GET support (payment.html)
    if (req.method === "GET") {
      priceId = req.query.priceId;
    }

    // POST support (index.html JS flow)
    if (req.method === "POST") {
      const body = req.body;
      priceId = body.priceId;
    }

    if (!priceId) {
      return res.status(400).send("Missing priceId");
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.BASE_URL}/success`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
    });

    // IMPORTANT: redirect for GET flow
    if (req.method === "GET") {
      return res.redirect(session.url);
    }

    // JSON response for POST flow
    return res.status(200).json({ url: session.url });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
