#!/bin/bash
# Give the Supabase service roles the password this instance actually uses.
#
# The `supabase/postgres` image creates these roles, but leaves them with
# whatever password it was built with — so GoTrue and storage-api start up and
# immediately fail with `28P01: password authentication failed`, which reads
# like the compose file has the wrong credentials rather than like the roles
# were never told. Setting them here is what upstream's self-hosted compose does
# too.
#
# Runs only on an empty data directory, which is the one moment these roles are
# guaranteed to exist and no service has tried to connect yet. Changing
# POSTGRES_PASSWORD later means running these ALTERs by hand.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  alter user authenticator          with password '$POSTGRES_PASSWORD';
  alter user supabase_auth_admin    with password '$POSTGRES_PASSWORD';
  alter user supabase_storage_admin with password '$POSTGRES_PASSWORD';
  alter user supabase_admin         with password '$POSTGRES_PASSWORD';
EOSQL

echo "sojourn: service role passwords set"
