# syntax=docker/dockerfile:1

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci || npm install

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public env vars are inlined at build time; pass them as build args in CI.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_SITE_NAME
ARG NEXT_PUBLIC_MAP_STYLE_URL
RUN npm run build

# ─── runner ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# ─── the migration runner ────────────────────────────────────────────────────
# Container start is this host's release seam (docs/adr/0002), and `standalone`
# contains only what Next traced from the app — which is not this, because
# nothing in the app imports it. So the runner's four pieces are copied in by
# hand: the script, the SQL it applies, the modules it shares with the app so
# both decide from one implementation, and its driver.
#
# `postgres` is used rather than `pg` precisely for this line: it has no
# dependencies, so one directory is the whole driver.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/supabase/migrations ./supabase/migrations
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/migrations.mjs \
     /app/src/lib/schema-version.mjs /app/src/lib/migrate-config.mjs ./src/lib/
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# So the admin's Updates page can name the right update gesture for this host
# without sniffing for /.dockerenv — which Podman omits and plenty of unrelated
# images carry. Nothing reads it but @/lib/update-hosts.
ENV SOJOURN_RUNTIME=docker

# Migrate, then serve — and only then. A container that could not bring the
# schema up to the code it is about to run has no business answering requests;
# exiting makes that visible in `docker logs` instead of as mystery 404s from
# pages selecting columns that do not exist yet.
#
# `exec` hands PID 1 to node so it receives SIGTERM and shuts down cleanly.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
