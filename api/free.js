import { redis } from "../lib/redis.js";

export default async function handler(req, res) {

  const session = req.query.session;
  const plan = req.query.plan || "p4";

  if (!session) {
    return res.status(400).send("Missing session");
  }

  await redis.set(`paid:session:${session}`, "paid", { ex: 3600 });
  await redis.set(`plan:session:${session}`, plan, { ex: 3600 });

  return res.redirect(
    302,
    `/api/fas?session=${encodeURIComponent(session)}`
  );
}
