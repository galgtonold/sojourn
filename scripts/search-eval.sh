#!/usr/bin/env bash
# Evaluate search relevance across a spread of terms (relevant / plausible /
# nonsensical). Hits {BASE}/api/search?q=<term> and prints how many stories +
# photos came back, plus the top story titles — so over-matching is obvious.
# Usage: bash scripts/search-eval.sh [BASE_URL]
set -u
BASE="${1:-https://sojourn-nine.vercel.app}"

# term|category
TERMS=(
  "glacier|relevant"
  "Perito Moreno|relevant"
  "Fitz Roy sunrise|relevant"
  "Kyoto autumn maple|relevant"
  "Lofoten Norway|relevant"
  "Dolomites mountains|relevant"
  "cycling Göta Kanal|relevant"
  "Bruno Weber sculpture park|relevant"
  "snow hiking|plausible"
  "beach sunset|plausible"
  "city nightlife|plausible"
  "desert dunes|plausible"
  "street food market|plausible"
  "underwater diving|plausible"
  "laskdglasndgklnds|nonsense"
  "qwertyuiop zxcvbn|nonsense"
  "12345 6789 xyzzy|nonsense"
)

printf "%-30s %-9s %6s %6s  %s\n" "QUERY" "CATEGORY" "POSTS" "PHOTOS" "TOP STORIES"
printf "%-30s %-9s %6s %6s  %s\n" "-----" "--------" "-----" "------" "-----------"
for entry in "${TERMS[@]}"; do
  q="${entry%%|*}"; cat="${entry##*|}"
  enc=$(printf '%s' "$q" | sed 's/ /%20/g')
  json=$(curl -s "${BASE}/api/search?q=${enc}")
  printf "%-30s %-9s %6s %6s  %s\n" "$q" "$cat" \
    "$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).posts.length)}catch{console.log("ERR")}})')" \
    "$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).photos.length)}catch{console.log("ERR")}})')" \
    "$(printf '%s' "$json" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).posts.slice(0,3).map(p=>p.title).join(" | "))}catch{console.log("")}})')"
done
