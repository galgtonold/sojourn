#!/usr/bin/env bash
# Repeatable full-response-time measurement for the in-scope public pages.
# Usage: bash scripts/measure-ttfb.sh [BASE_URL] [SAMPLES]
#
# Measures curl's time_total (full HTML response received) against a running
# `next start` server on localhost, where the network leg is negligible — so the
# number is the server's full render time INCLUDING any data fetch. We use
# time_total, NOT time_starttransfer (TTFB): React streaming SSR flushes the
# shell as the first byte before data resolves, so TTFB hides the real cost.
# Reports the MEDIAN of N warm samples per page (ms). Warms each page once first.
set -u
BASE="${1:-http://localhost:3000}"
N="${2:-20}"

# In-scope pages + one representative dynamic route of each kind.
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

printf "%-30s %10s\n" "PAGE" "MEDIAN_ms"
printf "%-30s %10s\n" "----" "---------"
for p in "${PAGES[@]}"; do
  url="${BASE}${p}"
  curl -s -o /dev/null "$url" >/dev/null 2>&1   # warm
  ms=$(
    for i in $(seq 1 "$N"); do
      curl -s -o /dev/null -w '%{time_total}\n' "$url" 2>/dev/null
    done | awk '{a[NR]=$1*1000} END{ if(NR==0){print "n/a";exit} n=asort(a); m=int((n+1)/2); if(n%2) printf "%.1f",a[m]; else printf "%.1f",(a[m]+a[m+1])/2 }'
  )
  printf "%-30s %10s\n" "$p" "$ms"
done
