#!/usr/bin/env bash
# Cold-hit measurement: the realistic worst case — a visitor arriving at an idle
# site, before the server's Supabase connection pool / data is warm. We restart
# the server ONCE, wait until it's up, then request each page exactly once in a
# fixed order and record curl's time_total (full HTML received). Re-running gives
# comparable numbers. This is the variance that static/ISR rendering removes.
#
# Usage: bash scripts/measure-cold.sh [BASE_URL]
set -u
BASE="${1:-http://localhost:3000}"

PAGES=(
  "/"
  "/posts"
  "/posts/dawn-on-fitz-roy"
  "/trips"
  "/trips/dolomites"
  "/trips/dolomites/map"
  "/photos"
  "/map"
  "/search"
)

printf "%-30s %10s %12s\n" "PAGE" "COLD_ms" "BYTES"
printf "%-30s %10s %12s\n" "----" "-------" "-----"
for p in "${PAGES[@]}"; do
  line=$(curl -s -o /dev/null -w '%{time_total} %{size_download}' "${BASE}${p}" 2>/dev/null)
  t=${line% *}; b=${line##* }
  ms=$(awk -v t="$t" 'BEGIN{printf "%.1f", t*1000}')
  printf "%-30s %10s %12s\n" "$p" "$ms" "$b"
done
