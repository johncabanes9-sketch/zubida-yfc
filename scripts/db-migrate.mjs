// Hosted-Supabase migration runner (replaces `supabase db reset` on machines
// without Docker). Applies supabase/migrations/*.sql in filename order, tracks
// applied files in a _migrations table, then applies supabase/seed.sql.
//
// Usage:
//   node scripts/db-migrate.mjs          # apply pending migrations + seed
//   node scripts/db-migrate.mjs --seed   # (re)apply seed only
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const migrationsDir = join(root, "supabase", "migrations");

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set (.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function ensureTracking() {
  await client.query(`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    );`);
}

async function applied() {
  const { rows } = await client.query("select name from _migrations");
  return new Set(rows.map((r) => r.name));
}

async function applyMigrations() {
  const done = await applied();
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  let count = 0;
  for (const f of files) {
    if (done.has(f)) { console.log(`  skip  ${f} (already applied)`); continue; }
    const sql = readFileSync(join(migrationsDir, f), "utf8");
    process.stdout.write(`  apply ${f} ... `);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into _migrations(name) values ($1)", [f]);
      await client.query("commit");
      console.log("ok");
      count++;
    } catch (e) {
      await client.query("rollback");
      console.log("FAILED");
      throw new Error(`${f}: ${e.message}`);
    }
  }
  return count;
}

async function applySeed() {
  const sql = readFileSync(join(root, "supabase", "seed.sql"), "utf8");
  process.stdout.write("  seed  supabase/seed.sql ... ");
  await client.query(sql);
  console.log("ok");
}

(async () => {
  const seedOnly = process.argv.includes("--seed");
  await client.connect();
  try {
    if (!seedOnly) {
      await ensureTracking();
      const n = await applyMigrations();
      console.log(`Migrations: ${n} applied.`);
    }
    await applySeed();
    console.log("Done.");
  } catch (e) {
    console.error("\nMigration error:", e.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
