import fs from 'node:fs/promises';
import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

// Parse BIGINT (type OID 20) as standard Javascript integers
pg.types.setTypeParser(20, (val) => parseInt(val, 10));

const SCHEMA_PATH = new URL('./schema.sql', import.meta.url);
const txStorage = new AsyncLocalStorage();

export function translateSql(sql) {
  // Strip out any SQLite specific PRAGMA commands
  let translated = sql.replace(/PRAGMA\s+[^;]+;?/gi, '');
  
  // Replace SQLite placeholder "?" with PostgreSQL placeholder "$1", "$2", etc.
  let index = 1;
  translated = translated.replace(/\?/g, () => `$${index++}`);
  
  // Replace SQLite specific "INSERT OR IGNORE INTO" with PostgreSQL "INSERT INTO ... ON CONFLICT (id) DO NOTHING"
  if (translated.toUpperCase().includes('INSERT OR IGNORE INTO')) {
    translated = translated.replace(/INSERT OR IGNORE INTO/i, 'INSERT INTO');
    translated += ' ON CONFLICT (id) DO NOTHING';
  }
  return translated;
}

const DATABASE_ERROR_HINTS = {
  ECONNREFUSED: 'PostgreSQL refused the connection. Confirm the PostgreSQL service is running and DATABASE_URL uses the PostgreSQL port, usually 5432.',
  '28P01': 'PostgreSQL rejected the username or password. Check the local PostgreSQL credentials.',
  ERR_INVALID_URL: 'DATABASE_URL is not a valid URL. Percent-encode special password characters such as @, #, :, /, ?, &, or %.',
  '3D000': 'The configured database does not exist. Create the database or update DATABASE_URL to an existing database name.',
};

function resolveConnectionString(databasePath) {
  if (databasePath && databasePath !== ':memory:') {
    return databasePath;
  }

  const envName = databasePath === ':memory:' ? 'DATABASE_URL_TEST' : 'DATABASE_URL';
  const connectionString = process.env[envName];

  if (!connectionString) {
    throw new Error(`${envName} is required. Create backend/.env from backend/.env.example and set a PostgreSQL connection string.`);
  }

  return connectionString;
}

function parseInvalidConnectionString(connectionString) {
  const details = {
    host: 'invalid-url',
    port: 'unknown',
    database: 'unknown',
    hasPotentialUnencodedPasswordCharacters: false,
  };
  const schemeEnd = connectionString.indexOf('://');
  const authorityStart = schemeEnd >= 0 ? schemeEnd + 3 : 0;
  const atIndex = connectionString.lastIndexOf('@');
  let hostPath = connectionString.slice(authorityStart);
  let password = '';

  if (atIndex >= authorityStart) {
    const userInfo = connectionString.slice(authorityStart, atIndex);
    const passwordStart = userInfo.indexOf(':');
    password = passwordStart >= 0 ? userInfo.slice(passwordStart + 1) : '';
    hostPath = connectionString.slice(atIndex + 1);
  }

  details.hasPotentialUnencodedPasswordCharacters = /[@#:/?&%]/.test(password);

  const slashIndex = hostPath.indexOf('/');
  const hostPort = (slashIndex >= 0 ? hostPath.slice(0, slashIndex) : hostPath).split(/[?#]/, 1)[0];
  const database = slashIndex >= 0 ? hostPath.slice(slashIndex + 1).split(/[?#]/, 1)[0] : '';

  if (hostPort) {
    const portSeparator = hostPort.lastIndexOf(':');
    if (portSeparator > 0 && !hostPort.endsWith(']')) {
      details.host = hostPort.slice(0, portSeparator) || 'unknown';
      details.port = hostPort.slice(portSeparator + 1) || 'unknown';
    } else {
      details.host = hostPort;
      details.port = '5432';
    }
  }

  if (database) {
    details.database = database;
  }

  return details;
}

function parseSafeConnectionDetails(connectionString) {
  if (!connectionString) {
    return {
      host: 'unknown',
      port: 'unknown',
      database: 'unknown',
      invalidUrl: false,
      hasPotentialUnencodedPasswordCharacters: false,
    };
  }

  try {
    const parsed = new URL(connectionString);
    return {
      host: parsed.hostname || 'unknown',
      port: parsed.port || '5432',
      database: parsed.pathname.replace(/^\//, '') || 'unknown',
      invalidUrl: false,
      hasPotentialUnencodedPasswordCharacters: false,
    };
  } catch {
    return {
      ...parseInvalidConnectionString(connectionString),
      invalidUrl: true,
    };
  }
}

export function getDatabaseDiagnostics(databasePath = process.env.DATABASE_URL) {
  const connectionString = resolveConnectionString(databasePath);
  const hasDatabaseUrl = Boolean(
    databasePath && databasePath !== ':memory:'
      ? databasePath
      : process.env.DATABASE_URL || (databasePath === ':memory:' && process.env.DATABASE_URL_TEST),
  );

  return {
    hasDatabaseUrl,
    ...parseSafeConnectionDetails(connectionString),
  };
}

export function formatDatabaseConnectionError(error, databasePath = process.env.DATABASE_URL) {
  const diagnostics = getDatabaseDiagnostics(databasePath);
  const driverErrorCode = error?.code || error?.cause?.code || 'unknown';
  const lines = [
    'PostgreSQL connection failed.',
    'Diagnostics: DATABASE_URL exists=' + (diagnostics.hasDatabaseUrl ? 'yes' : 'no') + ', host=' + diagnostics.host + ', port=' + diagnostics.port + ', database=' + diagnostics.database + '.',
    'Driver error code: ' + driverErrorCode + '.',
  ];

  const hint = DATABASE_ERROR_HINTS[driverErrorCode] || (diagnostics.invalidUrl ? DATABASE_ERROR_HINTS.ERR_INVALID_URL : null);
  if (hint) {
    lines.push('Hint: ' + hint);
  }

  if (diagnostics.hasPotentialUnencodedPasswordCharacters) {
    lines.push('Hint: The password portion appears to contain unencoded URL special characters. Encode them in backend/.env.');
  }

  lines.push('Create backend/.env from backend/.env.example and verify the database name, host, and port.');

  return lines.join('\n');
}

export async function openDatabase(databasePath = process.env.DATABASE_URL) {
  const connectionString = resolveConnectionString(databasePath);
  let pool;

  try {
    pool = new pg.Pool({ connectionString });
    const client = await pool.connect();
    client.release();
    return { pool };
  } catch (error) {
    if (pool) {
      await pool.end().catch(() => {});
    }
    throw error;
  }
}

export async function initializeDatabase(db, dropTables = false) {
  const schema = await fs.readFile(SCHEMA_PATH, 'utf8');
  if (dropTables) {
    const tables = ['audit_logs', 'logistics_locations', 'delivery_checkins', 'logistics_manifests', 'qc_checklists', 'work_items', 'warehouses', 'projects', 'users', 'roles'];
    for (const table of tables) {
      await exec(db, `DROP TABLE IF EXISTS ${table} CASCADE`);
    }
  }
  await exec(db, schema);
  await exec(db, "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT ''");
  await exec(db, 'ALTER TABLE logistics_manifests ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE');
  return db;
}

export async function createDatabase(databasePath) {
  const db = await openDatabase(databasePath);
  const isTest = databasePath === ':memory:';
  await initializeDatabase(db, isTest);
  return db;
}

function getActiveClient(db) {
  const txClient = txStorage.getStore();
  return txClient || db.pool;
}

export async function run(db, sql, params = []) {
  const client = getActiveClient(db);
  const res = await client.query(translateSql(sql), params);
  return { lastID: null, changes: res.rowCount };
}

export async function get(db, sql, params = []) {
  const client = getActiveClient(db);
  const res = await client.query(translateSql(sql), params);
  return res.rows[0] || null;
}

export async function all(db, sql, params = []) {
  const client = getActiveClient(db);
  const res = await client.query(translateSql(sql), params);
  return res.rows;
}

export async function exec(db, sql) {
  const client = getActiveClient(db);
  await client.query(translateSql(sql));
}

export async function closeDatabase(db) {
  await db.pool.end();
}

export async function withTransaction(db, operation) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, operation);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
