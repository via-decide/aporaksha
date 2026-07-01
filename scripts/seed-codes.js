import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getDB } from '../lib/db.js';
import { initDB } from '../lib/initDb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seed() {
  console.log('Initializing database schema...');
  await initDB();
  const db = await getDB();

  const codes = new Set();
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  while (codes.size < 100) {
    let key = '';
    // Generate 8 alphanumeric characters
    for (let i = 0; i < 8; i++) {
      const idx = crypto.randomInt(0, characters.length);
      key += characters[idx];
    }
    codes.add(`VIP-${key}`);
  }

  const codesArray = Array.from(codes);
  console.log(`Generated 100 unique codes. Seeding database...`);

  // Using simple queries for cross-compatibility
  try {
    for (const code of codesArray) {
      await db.run(
        'INSERT OR IGNORE INTO redemption_codes (code, is_used) VALUES (?, 0)',
        [code]
      );
    }
    console.log('SQLite seeding complete.');
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }

  // Export to CSV
  const csvContent = 'code,is_used\n' + codesArray.map(c => `${c},false`).join('\n');
  const csvPath = path.join(__dirname, '../redemption_codes.csv');
  fs.writeFileSync(csvPath, csvContent, 'utf8');
  console.log(`Successfully exported codes to: ${csvPath}`);
}

seed().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
