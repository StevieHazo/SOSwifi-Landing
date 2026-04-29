export default async function handler(req, res) {
  console.log("=== AUTH HIT ===");
  console.log("Query:", req.query);
  console.log("Headers:", req.headers);

  return res.status(200).send("Auth: 0");
}
