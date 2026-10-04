#!/usr/bin/env bash
# Backs up every file in the `media` storage bucket (gallery, leader, news and
# testimonial photos, event images, page images), checks it, and encrypts it.
#
# The file list comes from storage.objects over the database connection; the
# bytes come from each object's PUBLIC url (the bucket is public-read). So no
# service-role key is needed anywhere in CI.
#
# Output: one file, $OUT_DIR/zubida-media-<UTC stamp>.tar.gz.age, encrypted to
# $AGE_RECIPIENT. Photos of people, minors included, never leave the private
# temp directory unencrypted.
#
# Required env:
#   DATABASE_URL   Postgres session connection string (port 5432).
#   SUPABASE_URL   https://<project>.supabase.co
#   AGE_RECIPIENT  age public key (age1...).
# Optional env:
#   PG_BIN, OUT_DIR  as in backup.sh
#
# Fails on missing input, a failed download, a size mismatch, or any listed
# object missing from the archive.
set -euo pipefail

fail() { echo "media-backup: $*" >&2; exit 1; }

[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL is not set."
[ -n "${SUPABASE_URL:-}" ] || fail "SUPABASE_URL is not set."
[ -n "${AGE_RECIPIENT:-}" ] || fail "AGE_RECIPIENT is not set."
case "$AGE_RECIPIENT" in age1*) ;; *) fail "AGE_RECIPIENT must be an age public key (age1...)." ;; esac
case "$SUPABASE_URL" in https://*.supabase.co|https://*.supabase.co/) ;; *) fail "SUPABASE_URL must look like https://<project>.supabase.co" ;; esac
SUPABASE_URL="${SUPABASE_URL%/}"

PG_BIN="${PG_BIN:-}"
PSQL="psql"; [ -n "$PG_BIN" ] && PSQL="$PG_BIN/psql"
command -v age >/dev/null || fail "age is not installed."
command -v python3 >/dev/null || fail "python3 is required (url-encoding object names)."

OUT_DIR="${OUT_DIR:-backup-out}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$(mktemp -d)"
chmod 700 "$WORK"
trap 'rm -rf "$WORK"' EXIT
mkdir "$WORK/media"

# name <TAB> size (size empty when the metadata has none). Names are object
# keys the app generates (prefix/uuid.ext), but they come from a database, so
# they are still checked before being used as file paths.
"$PSQL" "$DATABASE_URL" -XAtq -F $'\t' -c \
  "select name, coalesce(metadata->>'size', '') from storage.objects where bucket_id = 'media' order by name" \
  > "$WORK/objects.tsv"
total="$(grep -c . "$WORK/objects.tsv" || true)"
echo "media-backup: $total object(s) listed"

downloaded=0
while IFS=$'\t' read -r name size; do
  [ -n "$name" ] || continue
  case "$name" in /*|*..*|*$'\n'*) fail "refusing unsafe object name: $name" ;; esac
  enc="$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="/"))' "$name")"
  dest="$WORK/media/$name"
  mkdir -p "$(dirname "$dest")"
  curl -fsS --retry 3 --retry-delay 2 --max-time 120 -o "$dest" \
    "$SUPABASE_URL/storage/v1/object/public/media/$enc" \
    || fail "download failed: $name"
  if [ -n "$size" ]; then
    got="$(wc -c < "$dest" | tr -d ' ')"
    [ "$got" = "$size" ] || fail "size mismatch for $name: expected $size, got $got"
  fi
  downloaded=$((downloaded + 1))
done < "$WORK/objects.tsv"

[ "$downloaded" = "$total" ] || fail "downloaded $downloaded of $total objects."
# Every listed object must be in the archive tree, and nothing else.
on_disk="$(cd "$WORK/media" && find . -type f | wc -l | tr -d ' ')"
[ "$on_disk" = "$total" ] || fail "archive holds $on_disk files, expected $total."

{
  echo "# zubida-media backup $STAMP — $total object(s)"
  echo "# name	bytes	sha256"
  while IFS=$'\t' read -r name _; do
    [ -n "$name" ] || continue
    printf '%s\t%s\t%s\n' "$name" "$(wc -c < "$WORK/media/$name" | tr -d ' ')" \
      "$(sha256sum "$WORK/media/$name" | cut -d' ' -f1)"
  done < "$WORK/objects.tsv"
} > "$WORK/manifest.tsv"

echo "media-backup: encrypting"
mkdir -p "$OUT_DIR"
OUT="$OUT_DIR/zubida-media-$STAMP.tar.gz.age"
tar -C "$WORK" -czf - media manifest.tsv | age --recipient "$AGE_RECIPIENT" --output "$OUT"
[ -s "$OUT" ] || fail "encryption produced no output."
head -c 21 "$OUT" | grep -q "age-encryption.org/v1" || fail "output is not age-encrypted."
echo "media-backup: wrote $OUT ($(wc -c < "$OUT") bytes, $total object(s))"
