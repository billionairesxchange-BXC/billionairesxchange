const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to run database migrations.');
}

const ssl = process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: process.env.RENDER !== 'true' }
  : false;
const migrationsDirectory = path.join(__dirname, '..', 'database', 'migrations');
const client = new Client({ connectionString, ssl });

async function runMigrations() {
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const filenames = fs.readdirSync(migrationsDirectory)
      .filter((filename) => /^\d+_[\w-]+\.sql$/.test(filename))
      .sort();

    for (const filename of filenames) {
      const applied = await client.query(
        'SELECT 1 FROM app_schema_migrations WHERE filename = $1',
        [filename]
      );
      if (applied.rowCount) continue;

      await client.query('BEGIN');
      try {
        const sql = fs.readFileSync(path.join(migrationsDirectory, filename), 'utf8');
        await client.query(sql);
        await client.query('INSERT INTO app_schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        console.log(`Applied database migration ${filename}.`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
}

runMigrations().catch((error) => {
  console.error('Database migrations failed:', error);
  process.exitCode = 1;
});