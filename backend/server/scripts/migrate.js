import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, closeDatabase, exec, openDatabase, run, withTransaction } from '../db/database.js';

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

async function main() {
  const db = await openDatabase(process.env.DATABASE_URL);
  try {
    await exec(db, 'CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const applied = new Set((await all(db, 'SELECT version FROM schema_migrations')).map((row) => row.version));
    const files = (await fs.readdir(migrationsDir)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();

    for (const file of files) {
      const version = file.split('_')[0];
      if (applied.has(version)) continue;
      const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
      await withTransaction(db, async () => {
        await exec(db, sql);
        await run(db, 'INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [version, file]);
      });
      console.log(`applied ${file}`);
    }

    if (files.every((file) => applied.has(file.split('_')[0]))) {
      console.log('migrations already up to date');
    }
  } finally {
    await closeDatabase(db);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
