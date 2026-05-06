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
    const riskScore = Math.min(100, score);
    const severity = riskScore > 85 ? "CRITICAL" : riskScore > 60 ? "HIGH" : "NORMAL";
    const aiSummary = severity === "CRITICAL" ? "Immediate investigation required" : "Monitor activity";
    return { ...e, riskScore, severity, aiSummary, alert: severity !== "NORMAL" };
    return { ...e, riskScore: Math.min(100, score) };
  }).sort((a, b) => b.riskScore - a.riskScore);
  res.status(200).json(ranked);
}
