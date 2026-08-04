#!/bin/sh
# Restore an all-in-one Sojourn from a scripts/backup.sh archive.
#
#   scripts/restore.sh backups/sojourn-20260804-125000Z.tar.gz
#
# This REPLACES the current database and photographs. It asks first, unless you
# pass --yes.
#
# The stack must be running: restoring works through the same containers that
# serve the site, so there is nothing to set up and nothing to get subtly
# different from how the backup was taken.
#
# Note on keys: the archive does NOT contain .env.selfhost. Restoring into a
# stack with a different JWT secret gives you all your posts and photographs
# back, and every existing session signed out — the passwords still work. Keep
# .env.selfhost with your backups if you would rather not deal with that.
set -eu

# Git Bash on Windows rewrites anything in a command argument that looks like a
# Unix path, so `/data` reaches Docker as `C:/Program Files/Git/data`. Scoped to
# the docker calls only — exporting it globally breaks the host's own tar, which
# then reads `C:` as a remote machine to connect to. Unset elsewhere, harmless.
NOCONV="env MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL=*"

ARCHIVE="${1:-}"
ASSUME_YES="${2:-}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.all-in-one.yml}"
ENV_FILE="${ENV_FILE:-.env.selfhost}"
PROJECT="${PROJECT:-sojourn}"

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "restore: usage: scripts/restore.sh <archive.tar.gz> [--yes]" >&2
  exit 1
fi

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

if ! compose ps --status running --services 2>/dev/null | grep -q '^db$'; then
  echo "restore: the stack is not running — bring it up first, then restore." >&2
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
# Read from stdin rather than handing tar the path: an archive kept somewhere
# like C:/backups makes tar read `C:` as a machine to connect to, and
# --force-local is GNU-only so it is not the portable answer.
tar xz -C "$WORK" < "$ARCHIVE"

if [ ! -f "$WORK/db.sql" ] || [ ! -f "$WORK/storage.tar" ]; then
  echo "restore: $ARCHIVE is missing db.sql or storage.tar — not a Sojourn backup." >&2
  exit 1
fi

echo "--- $ARCHIVE" >&2
cat "$WORK/MANIFEST" >&2 2>/dev/null || true

if [ "$ASSUME_YES" != "--yes" ]; then
  printf 'This REPLACES the current database and photographs. Type yes to continue: ' >&2
  read -r reply
  [ "$reply" = "yes" ] || { echo "restore: cancelled." >&2; exit 1; }
fi

echo "restore: loading the database…" >&2
# The dump was taken with --clean --if-exists, so it drops what it is about to
# recreate. ON_ERROR_STOP is deliberately NOT set: a dump of a live Supabase
# database always contains a few statements about extensions and roles the image
# already owns, and those are noise rather than failure. The verification below
# is what decides whether this worked.
compose exec -T db psql -U postgres -q postgres < "$WORK/db.sql" > /dev/null 2>&1 || true

echo "restore: putting the photographs back…" >&2
# Streamed in over stdin, for the same portability reason as the backup side.
$NOCONV docker run --rm -i -v "${PROJECT}_storage-data:/data" alpine:3 \
  sh -c 'rm -rf /data/* && cd /data && tar xf -' < "$WORK/storage.tar"

# Say what actually landed, rather than "done". This is the number someone
# checks when they are already having a bad day.
POSTS=$(compose exec -T db psql -U postgres -tAc 'select count(*) from posts' 2>/dev/null | tr -d '\r ')
USERS=$(compose exec -T db psql -U postgres -tAc 'select count(*) from auth.users' 2>/dev/null | tr -d '\r ')
FILES=$($NOCONV docker run --rm -v "${PROJECT}_storage-data:/data:ro" alpine:3 sh -c 'find /data -type f | wc -l' | tr -d '\r ')

echo "restore: $POSTS post(s), $USERS account(s), $FILES photo file(s)." >&2
# RECREATE, not restart. Next caches rendered pages inside the container's own
# filesystem, and a restart keeps them — so the site would carry on serving the
# pages it built from the data you just replaced, for up to an hour, and the
# restore would look like it had failed.
echo "restore: now recreate the app container, so it stops serving pages it" >&2
echo "         rendered from the old data:" >&2
echo "  docker compose -f $COMPOSE_FILE --env-file $ENV_FILE up -d --force-recreate web" >&2
