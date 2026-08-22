import { readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

/**
 * Runner de migraciones simple e idempotente: aplica db/migrations/*.sql en orden
 * y registra las aplicadas en schema_migrations.
 */
const here = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL no definida. Levanta PostgreSQL (docker compose up -d) y configura .env');
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;

  const applied = new Set(
    (await sql`SELECT name FROM schema_migrations`).map((r) => r['name'] as string),
  );

  const dir = resolve(here, 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} (ya aplicada)`);
      continue;
    }
    const content = readFileSync(resolve(dir, file), 'utf-8');
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    console.log(`+ ${file} aplicada`);
  }

  await sql.end();
  console.log('Migraciones completadas.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
