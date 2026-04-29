import { redis } from "../lib/redis.js";

export default async function handler(req, res) {
  const { mac } = req.query;

  if (!mac) {
    return res.status(200).send("Auth: 0");
  }

  const key = `mac:${mac}`;
  const data = await redis.get(key);

  if (data) {
    return res.status(200).send("Auth: 1");
  } else {
    return res.status(200).send("Auth: 0");
  }
}
