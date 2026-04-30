export default async function handler(req, res) {
  try {
    const { mac, ip, fas } = req.query;

    // TEMP: handle both cases
    if (!mac && !fas) {
      return res.status(400).send("Missing client info");
    }

    // For now, just pass fas forward (no decode yet)
    return res.redirect(`https://soswifi.uk/?session=${encodeURIComponent(fas || mac)}`);

  } catch (err) {
    return res.status(500).send(err.message);
  }
}
