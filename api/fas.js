export default async function handler(req, res) {
  if (req.method === "POST" || req.method === "GET") {
    return res.status(200).send("ok");
  }
  return res.status(405).end("Method Not Allowed");
}
