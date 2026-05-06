import { getDB } from "../lib/db";
import { initDB } from "../lib/initDb";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).end();
  }

  await initDB();
  const db = await getDB();
  const logs = await db.all("SELECT * FROM events ORDER BY id DESC LIMIT 50");
  res.status(200).json(logs);
}
