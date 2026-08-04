#!/bin/sh
# Back up an all-in-one Sojourn: the database and the photographs, together.
#
#   scripts/backup.sh [output-directory]
#
# Produces one file, sojourn-<timestamp>.tar.gz, containing:
#   db.sql       every schema, including `auth` — that is your login
#   storage/     the photo files themselves
#   MANIFEST     what this is, when, and from which version
#
# Both halves or neither. A database dump on its own restores an archive of
# captions pointing at photographs that no longer exist, and a copy of the photo
# volume on its own is a folder of files nothing can find. They also have to be
# taken close together, which is why this is one script and not two.
#
# Restore with scripts/restore.sh. Do that at least once, on purpose, before you
# need it — an untested backup is a belief, not a backup.
set -eu

# Git Bash on Windows rewrites anything in a command argument that looks like a
# Unix path, so `/data` reaches Docker as `C:/Program Files/Git/data`. Scoped to
# the docker calls only — exporting it globally breaks the host's own tar, which
# then reads `C:` as a remote machine to connect to. Unset elsewhere, harmless.
NOCONV="env MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL=*"

OUT_DIR="${1:-backups}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.all-in-one.yml}"
ENV_FILE="${ENV_FILE:-.env.selfhost}"
# Matches `name: sojourn` in the compose file; volumes are prefixed with it.
PROJECT="${PROJECT:-sojourn}"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

if ! compose ps --status running --services 2>/dev/null | grep -q '^db$'; then
  echo "backup: the db container is not running — start the stack first." >&2
  exit 1
fi

STAMP=$(date -u +%Y%m%d-%H%M%SZ)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT_DIR"

echo "backup: dumping the database…" >&2
# Every schema, not just `public`: `auth` holds the accounts, and `storage`
# holds the rows that tell the app which file belongs to which photo. Restoring
# `public` alone leaves you locked out of your own blog.
compose exec -T db pg_dump -U postgres --clean --if-exists --no-owner postgres \
  > "$WORK/db.sql"

echo "backup: copying the photographs…" >&2
# Through a throwaway container, so this needs no root on the host and does not
# care where the volume lives. Streamed over stdout rather than written into a
# mounted host directory: bind-mounting a temp path is the one part of this that
# behaves differently on Linux, macOS and Git Bash on Windows. A pipe does not.
$NOCONV docker run --rm -v "${PROJECT}_storage-data:/data:ro" alpine:3 \
  tar cf - -C /data . > "$WORK/storage.tar"

{
  echo "sojourn backup"
  echo "taken:    $STAMP"
  echo "project:  $PROJECT"
  echo "db bytes: $(wc -c < "$WORK/db.sql")"
  echo "photos:   $($NOCONV docker run --rm -v "${PROJECT}_storage-data:/data:ro" alpine:3 sh -c 'find /data -type f | wc -l')"
  echo
  echo "Restore with:  scripts/restore.sh <this file>"
} > "$WORK/MANIFEST"

ARCHIVE="$OUT_DIR/sojourn-$STAMP.tar.gz"
# Built inside the work directory and moved, rather than written straight to an
# absolute path: on Git Bash that path starts `C:/`, and tar reads a leading
# `host:` as a machine to connect to.
(cd "$WORK" && tar czf sojourn.tar.gz MANIFEST db.sql storage.tar)
mv "$WORK/sojourn.tar.gz" "$ARCHIVE"

echo "backup: wrote $ARCHIVE ($(wc -c < "$ARCHIVE") bytes)" >&2
echo "$ARCHIVE"
