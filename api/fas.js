import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_KV_URL,
  token: process.env.UPSTASH_KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  try {
    const { mac, ip } = req.query;

    if (!mac) {
      return res.status(400).send("Missing MAC");
    }

    // store client session
    await redis.set(`client:${mac}`, {
      mac,
      ip,
      status: "pending",
      ts: Date.now(),
    });

    // redirect to main page with session
    return res.redirect(`https://soswifi.uk/?session=${encodeURIComponent(mac)}`);

  } catch (err) {
    return res.status(500).send(err.message);
  }
}
