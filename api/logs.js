import { getDB } from "../lib/db";
import { initDB } from "../lib/initDb";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  await initDB();
  const db = await getDB();
  const logs = await db.all("SELECT * FROM events ORDER BY id DESC LIMIT 50");
  const ranked = logs.map((e) => {
    const payload = JSON.parse(e.payload || "{}");
    const score = Number(payload.score || (e.type === "fraud_detected" ? 90 : 20));
    return { ...e, riskScore: Math.min(100, score) };
  }).sort((a, b) => b.riskScore - a.riskScore);
  res.status(200).json(ranked);
}
