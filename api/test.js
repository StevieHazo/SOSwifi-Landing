import { redis } from "../lib/redis.js";

export default async function handler(req, res) {
  const mac = "AA:BB:CC:DD:EE:FF";

  await redis.set(`mac:${mac}`, "paid", { ex: 300 }); // 5 min

  return res.status(200).json({ status: "stored" });
}
