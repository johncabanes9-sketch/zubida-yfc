# Database backups

Supabase's free tier keeps no point-in-time recovery. Every night at 02:00
Manila time, the `backup` GitHub Action runs two jobs, `backup` (the
database) and `media` (the uploaded photo files). Each one checks its
archive is complete, **encrypts it**, and keeps it as a workflow artifact for
30 days.

The repository is public, and workflow artifacts on a public repository can
be downloaded by any signed-in GitHub user. The data includes minors'
registration details and photos of people. So every backup is encrypted with your `age` public
key before it leaves the runner. Only your private key can open it, and that
key never goes to GitHub.

## What is in a backup

| File | Contents |
| --- | --- |
| `public.dump` | Every table the app owns: schema and data. Events, registrations, admins, chapters, leaders, gallery, news, testimonials, contact messages, audit log, and the rest. The check compares against the live database, so a new table is covered automatically. |
| `auth.dump` | `auth.users` and `auth.identities` (data only). Admin rows and consent records point at these. |
| `storage.dump` | `storage.buckets` and `storage.objects`: the list of uploaded files, **not the files themselves**. |
| `manifest.tsv` | Row count per table at backup time, to check a restore against. |

The **photos** archive (`zubida-media-<run id>`) holds every file in the `media`
bucket: gallery, leader, news and testimonial photos, event and page images.
Its `manifest.tsv` lists each file's name, size and sha256. The files are
fetched by their public URL, and the file list comes from the database
connection, so no service-role key is ever given to GitHub. A failed download
or a size mismatch fails the job.

## One-time setup

1. **Make a key pair** on your own computer. On Windows, install with
   `winget install FiloSottile.age`; on a Mac, `brew install age`.

   ```sh
   age-keygen -o zubida-backup-key.txt
   ```

   It prints `Public key: age1…`. Keep `zubida-backup-key.txt` somewhere safe and
   offline, for example a password manager or a USB drive in a drawer. **Lose it
   and every backup is unreadable. Leak it and every backup is readable.** Never
   commit it, email it, or upload it.

2. **Give GitHub the public key and the database address.** In Supabase, open the
   production project, choose **Connect**, then **Session pooler**, and copy the
   URI (port **5432**). The transaction pooler on 6543 does not work with
   `pg_dump`.

   ```sh
   gh secret set BACKUP_AGE_RECIPIENT   # paste the age1… public key
   gh secret set BACKUP_DATABASE_URL    # paste the session pooler URI
   gh secret set BACKUP_SUPABASE_URL    # https://<project>.supabase.co (Settings → API)
   ```

3. **Run it once** to confirm: GitHub → Actions → **backup** → *Run workflow*,
   or `gh workflow run backup`. Both jobs should turn green, with a
   `zubida-db-<run id>` artifact and a `zubida-media-<run id>` artifact attached.

A run with either secret missing fails red on purpose.

## Restoring

1. Download and decrypt:

   ```sh
   gh run list --workflow backup            # pick a run id
   gh run download <run-id>                 # creates zubida-db-<run-id>/
   age --decrypt -i zubida-backup-key.txt zubida-db-<run-id>/zubida-db-*.tar.gz.age | tar -xzf -
   ```

2. Restore into a **new, empty** Supabase project. Never restore over a live
   database. `$URL` is the new project's session pooler URI. Order matters:
   accounts first, because public rows reference them.

   ```sh
   pg_restore --data-only --no-owner -d "$URL" auth.dump
   pg_restore --no-owner --no-privileges -d "$URL" public.dump
   pg_restore --data-only --no-owner -d "$URL" storage.dump   # only if you also restore the media files
   ```

   `pg_restore` loads table data before it creates constraints and triggers.
   The integrity triggers therefore don't block restored rows, and the foreign
   keys are checked once at the end.

3. Restore the photos. Decrypt the `zubida-media-…` archive the same way, then,
   with `.env.local` pointing at the **new** project, run:

   ```sh
   node scripts/backup/restore-media.mjs <unpacked-dir> --dry-run   # see what it would do
   node scripts/backup/restore-media.mjs <unpacked-dir>
   ```

   It checks every file against the manifest's sha256 before uploading. It
   skips files that are already there, so you can safely run it again. It
   exits non-zero if anything fails. Restore `storage.dump` (step 2) only
   after the files are back.

4. Compare row counts against `manifest.tsv`, point the site's environment
   variables at the new project, and redeploy.

Practise this once, into a throwaway project, before you need it.

## How it is verified

`backup-verify` runs on every pull request that touches the backup code:

- It backs up the **TEST** project.
- It encrypts the result with a throwaway key generated inside the runner.
- It proves the result can't be read without that key.
- It decrypts the backup and checks every table is in the archive.
- It also checks that missing or invalid inputs are refused.

It also round-trips the photos. The TEST bucket keeps two permanent probe
files under `backup-probe/` (one name has a space and parentheses). They are
checked byte for byte after decryption, so don't delete them.

It needs the `BACKUP_VERIFY_DATABASE_URL` secret, set to the TEST project's
session URI and **never production**, and `BACKUP_VERIFY_SUPABASE_URL`, set to
the TEST project URL. Without them, it skips.
