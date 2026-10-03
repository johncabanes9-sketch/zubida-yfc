// Restores photo files from a decrypted media backup into the `media` bucket.
//
//   node scripts/backup/restore-media.mjs <extracted-dir> [--dry-run]
//
// <extracted-dir> is where the archive was unpacked: it holds manifest.tsv
// and media/. Uses NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from
// the environment (or .env.local) of the project being restored INTO — run it
// on your own machine, never in CI.
//
// Every file is checked against the manifest's sha256 before upload. Files
// already present in the bucket with the same size are skipped, so a partial
// restore can simply be run again. Exits non-zero if anything fails.
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

const [dir, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const die = (m) => { console.error(`restore-media: ${m}`); process.exit(1); };
if (!dir) die("usage: node scripts/backup/restore-media.mjs <extracted-dir> [--dry-run]");
const manifestPath = join(dir, "manifest.tsv");
if (!existsSync(manifestPath)) die(`no manifest.tsv in ${dir} — point this at the unpacked archive.`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) die("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for the target project.");
const db = createClient(url, key, { auth: { persistSession: false } });

const entries = readFileSync(manifestPath, "utf8").split(/\r?\n/)
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => { const [name, bytes, sha] = l.split("\t"); return { name, bytes: Number(bytes), sha }; });

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const existing = async (name) => {
  const { data } = await db.storage.from("media").list(posix.dirname(name), { search: posix.basename(name), limit: 100 });
  return (data ?? []).find((o) => o.name === posix.basename(name));
};

console.log(`restore-media: ${entries.length} file(s) in manifest → ${new URL(url).host}${dryRun ? " (dry run)" : ""}`);
let restored = 0, skipped = 0, failed = 0;
for (const e of entries) {
  if (!e.name || e.name.startsWith("/") || e.name.includes("..")) { console.error(`  unsafe name: ${e.name}`); failed++; continue; }
  const file = join(dir, "media", ...e.name.split("/"));
  if (!existsSync(file)) { console.error(`  missing from archive: ${e.name}`); failed++; continue; }
  const bytes = readFileSync(file);
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (bytes.length !== e.bytes || sha !== e.sha) { console.error(`  checksum mismatch: ${e.name}`); failed++; continue; }

  const there = await existing(e.name);
  if (there && Number(there.metadata?.size) === bytes.length) { skipped++; continue; }
  if (dryRun) { console.log(`  would restore ${e.name}`); restored++; continue; }
  const ext = e.name.split(".").pop()?.toLowerCase() ?? "";
  const up = await db.storage.from("media").upload(e.name, bytes, { contentType: MIME[ext] ?? "application/octet-stream", upsert: !!there });
  if (up.error) { console.error(`  upload failed: ${e.name}: ${up.error.message}`); failed++; continue; }
  restored++;
}
console.log(`restore-media: ${restored} ${dryRun ? "to restore" : "restored"}, ${skipped} already present, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
