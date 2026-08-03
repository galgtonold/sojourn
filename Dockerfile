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
# Deliberately NO build args for the public config.
#
# Next inlines `process.env.NEXT_PUBLIC_*` into the browser bundle at build
# time, which is fine when whoever builds is whoever deploys — and wrong the
# moment this image is published, because it would carry the builder's Supabase
# URL into every visitor's JavaScript. The server now reads its environment at
# request time and hands the result to the page (see src/lib/public-config.ts),
# so one image serves any deployment and everything below is set at RUN time.
#
# `next build` still needs *a* Supabase URL to prerender with, because the client
# wrappers throw rather than quietly serve an empty page. `.invalid` is reserved
# by RFC 2606 and can never resolve, so this cannot accidentally point at a real
# project — and @/lib/public-config recognises it as a placeholder, so the app
# reports itself unconfigured rather than failing DNS. Same trick as CI.
ENV NEXT_PUBLIC_SUPABASE_URL=https://build.invalid
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=build-placeholder-anon-key
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
