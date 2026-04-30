export default async function handler(req, res) {
  try {
    const { mac, ip, fas } = req.query;

    // TEMP: allow flow even if not decoded yet
    const session = mac || fas || "unknown";

    return res.redirect(`https://soswifi.uk/?session=${encodeURIComponent(session)}`);

  } catch (err) {
    return res.redirect(`https://soswifi.uk/error`);
  }
}
