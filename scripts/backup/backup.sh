#!/usr/bin/env bash
# Dumps the Zubida YFC database, checks the dump is complete, and encrypts it.
#
# Output: one file, $OUT_DIR/zubida-db-<UTC stamp>.tar.gz.age, encrypted to
# $AGE_RECIPIENT. Nothing unencrypted is ever written outside a private temp
# directory that is removed on exit — the repository is public, and the data
# includes minors' registration details.
#
# Required env:
#   DATABASE_URL   Postgres connection string (session connection, port 5432).
#   AGE_RECIPIENT  age public key (age1...). Only its private key can decrypt.
# Optional env:
#   PG_BIN         directory holding pg_dump/pg_restore/psql 17 (default: PATH)
#   OUT_DIR        where the encrypted file goes (default: backup-out)
#
# Fails (non-zero) on any missing input, dump error, or incomplete dump: a
# backup job that goes green without a usable backup is worse than a red one.
set -euo pipefail

fail() { echo "backup: $*" >&2; exit 1; }

[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set."
[ -n "${AGE_RECIPIENT:-}" ] || fail "AGE_RECIPIENT is not set."
case "$AGE_RECIPIENT" in age1*) ;; *) fail "AGE_RECIPIENT must be an age public key (age1...)." ;; esac

PG_BIN="${PG_BIN:-}"
bin() { if [ -n "$PG_BIN" ]; then echo "$PG_BIN/$1"; else echo "$1"; fi; }
PG_DUMP="$(bin pg_dump)"; PG_RESTORE="$(bin pg_restore)"; PSQL="$(bin psql)"
command -v age >/dev/null || fail "age is not installed."
"$PG_DUMP" --version | grep -q " 17\| 18" || fail "pg_dump 17+ is required (server is Postgres 17)."

OUT_DIR="${OUT_DIR:-backup-out}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "backup: dumping"
# 1. The app's own schema and data. No owners/grants: a restore target is a
#    fresh Supabase project whose roles already exist.
"$PG_DUMP" "$DATABASE_URL" --format=custom --schema=public --no-owner --no-privileges \
  --file="$WORK/public.dump"
# 2. Accounts. Admin rows and consent records reference auth.users, so the
#    public data cannot be restored without them. Data only: the auth schema
#    itself belongs to Supabase.
"$PG_DUMP" "$DATABASE_URL" --format=custom --data-only \
  --table=auth.users --table=auth.identities \
  --file="$WORK/auth.dump"
# 3. Storage metadata (which files exist and where). The image files
#    themselves live in the media bucket and are NOT in this dump.
"$PG_DUMP" "$DATABASE_URL" --format=custom --data-only \
  --table=storage.buckets --table=storage.objects \
  --file="$WORK/storage.dump"

echo "backup: verifying"
# Every table that exists in the live public schema must have its data in the
# archive — compared against the database itself, not a hardcoded list, so a
# new migration's table is covered the day it ships.
"$PSQL" "$DATABASE_URL" -XAtq -c \
  "select tablename from pg_tables where schemaname = 'public' order by 1" > "$WORK/live-tables.txt"
[ -s "$WORK/live-tables.txt" ] || fail "no public tables found — wrong database?"
for core in events event_registrations admins clusters; do
  grep -qx "$core" "$WORK/live-tables.txt" || fail "core table public.$core is missing from the live database — wrong database?"
done
"$PG_RESTORE" --list "$WORK/public.dump" > "$WORK/public.list"
missing=0
while read -r t; do
  # Archive lines read: "<id>; <oid> <oid> TABLE DATA public <table> <owner>"
  if ! grep -Eq "TABLE DATA public $t( |$)" "$WORK/public.list"; then
    echo "backup: no data entry for public.$t" >&2; missing=1
  fi
done < "$WORK/live-tables.txt"
[ "$missing" = 0 ] || fail "the dump is incomplete."
"$PG_RESTORE" --list "$WORK/auth.dump" | grep -Eq "TABLE DATA auth users( |$)" || fail "auth.users is missing from the dump."
"$PG_RESTORE" --list "$WORK/storage.dump" | grep -Eq "TABLE DATA storage objects( |$)" || fail "storage.objects is missing from the dump."

# Row counts, so a restore can be checked against what was backed up.
{
  echo "# zubida-db backup $STAMP"
  echo "# table	rows"
  while read -r t; do
    printf '%s\t%s\n' "public.$t" "$("$PSQL" "$DATABASE_URL" -XAtq -c "select count(*) from public.\"$t\"")"
  done < "$WORK/live-tables.txt"
  printf '%s\t%s\n' "auth.users" "$("$PSQL" "$DATABASE_URL" -XAtq -c "select count(*) from auth.users")"
  printf '%s\t%s\n' "storage.objects" "$("$PSQL" "$DATABASE_URL" -XAtq -c "select count(*) from storage.objects")"
} > "$WORK/manifest.tsv"
rm -f "$WORK/live-tables.txt" "$WORK/public.list"

echo "backup: encrypting"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/zubida-db-$STAMP.tar.gz.age"
tar -C "$WORK" -czf - public.dump auth.dump storage.dump manifest.tsv \
  | age --recipient "$AGE_RECIPIENT" --output "$OUT"
[ -s "$OUT" ] || fail "encryption produced no output."
# Belt and braces: the output must be an age file, never a plaintext archive.
head -c 21 "$OUT" | grep -q "age-encryption.org/v1" || fail "output is not age-encrypted."

echo "backup: wrote $OUT ($(wc -c < "$OUT") bytes)"
