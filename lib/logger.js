import { getDB } from "./db";

export async function logEvent(type, payload) {
  const db = await getDB();
  await db.run("INSERT INTO events (type, payload) VALUES (?, ?)", [
    type,
    JSON.stringify(payload),
  ]);
}
