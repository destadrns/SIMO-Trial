import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  closeDatabase,
  exec,
  initializeDatabase,
  openDatabase,
  run,
  withTransaction,
} from './database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const BASELINE_ID = '0001_schema_baseline';

async function ensureMigrationsTable(db) {
  await exec(db, `CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function getAppliedMigrationIds(db) {
  const result = await db.pool.query('SELECT id FROM schema_migrations ORDER BY id');
  return new Set(result.rows.map((row) => row.id));
}

async function readSqlMigrations() {
  let entries;
  try {
    entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({
      id: entry.name.replace(/\.sql$/i, ''),
      path: path.join(MIGRATIONS_DIR, entry.name),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function migrateDatabase({ databasePath = process.env.DATABASE_URL } = {}) {
  const db = await openDatabase(databasePath);
  const applied = [];

  try {
    await ensureMigrationsTable(db);
    const appliedIds = await getAppliedMigrationIds(db);

    if (!appliedIds.has(BASELINE_ID)) {
      await withTransaction(db, async () => {
        await initializeDatabase(db, false);
        await run(db, 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)', [BASELINE_ID]);
      });
      applied.push(BASELINE_ID);
      appliedIds.add(BASELINE_ID);
    }

    const migrations = await readSqlMigrations();
    for (const migration of migrations) {
      if (migration.id === BASELINE_ID || appliedIds.has(migration.id)) {
        continue;
      }

      const sql = await fs.readFile(migration.path, 'utf8');
      await withTransaction(db, async () => {
        if (sql.trim()) {
          await exec(db, sql);
        }
        await run(db, 'INSERT INTO schema_migrations (id, applied_at) VALUES (?, CURRENT_TIMESTAMP)', [migration.id]);
      });
      applied.push(migration.id);
    }

    return applied;
  } finally {
    await closeDatabase(db);
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  migrateDatabase()
    .then((applied) => {
      if (applied.length) {
        console.log(`Applied migrations: ${applied.join(', ')}`);
      } else {
        console.log('Database migrations already up to date.');
      }
    })
    .catch((error) => {
      console.error('Failed to migrate SIMO database.', error);
      process.exitCode = 1;
    });
}
