import { redis } from "../lib/redis.js";

export default async function handler(req, res) {
  await redis.set("test_key", "working", { ex: 60 });

  const value = await redis.get("test_key");

  return res.status(200).json({ value });
}
