#!/bin/bash
# RVA Burlesque - source discovery.
# Asks Claude to find new venues/troupes hosting burlesque in RVA that we
# aren't already tracking, and appends any findings to sources.json.
#
# Scheduled weekly Monday but biweekly-throttled via a guard file.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SOURCES_FILE="$SCRIPT_DIR/sources.json"
LOG_FILE="$PROJECT_DIR/logs/discover.log"
LOCK_FILE="$PROJECT_DIR/.discover.lock"
GUARD_FILE="$PROJECT_DIR/.last-discover"
MIN_DAYS_BETWEEN_RUNS=12

# shellcheck disable=SC1091
source "$SCRIPT_DIR/notify.sh"

cleanup() {
    rm -f "$LOCK_FILE"
}
trap cleanup EXIT

if [ -f "$LOCK_FILE" ]; then
    echo "Another discovery is already running"
    exit 1
fi
touch "$LOCK_FILE"

mkdir -p "$(dirname "$LOG_FILE")"

# Biweekly guard: skip if we ran less than MIN_DAYS_BETWEEN_RUNS days ago
if [ -f "$GUARD_FILE" ]; then
    LAST_RUN=$(stat -f %m "$GUARD_FILE" 2>/dev/null || echo 0)
    NOW=$(date +%s)
    AGE_DAYS=$(( (NOW - LAST_RUN) / 86400 ))
    if [ "$AGE_DAYS" -lt "$MIN_DAYS_BETWEEN_RUNS" ]; then
        echo "Last discover ran ${AGE_DAYS} day(s) ago; skipping for biweekly cadence."
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Skipped (last ran ${AGE_DAYS} days ago)" >> "$LOG_FILE"
        exit 0
    fi
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting source discovery" >> "$LOG_FILE"
CURRENT_SOURCES=$(cat "$SOURCES_FILE")

PROMPT=$(cat <<PROMPT_EOF
You are helping maintain an RVA (Richmond, VA) burlesque calendar.

Here are the sources we currently track:
$CURRENT_SOURCES

Search the web for burlesque, cabaret-with-burlesque, or nerdlesque shows
in Richmond, Virginia that we are NOT already tracking. Look for:

1. Bars, breweries, theaters, or galleries hosting burlesque
2. Burlesque troupes / producers / solo performers based in RVA
3. Recurring series we are missing (e.g. monthly events at a specific venue)
4. Aggregator listings that surface RVA-specific shows we should follow

For each NEW source, output a JSON array of source objects in this format:

[
  {
    "id": "short-kebab-case-id",
    "url": "https://direct-url-to-their-events-page",
    "location": "Venue or troupe name",
    "address": "Full street address (or 'Richmond, VA' for troupes that float)",
    "defaultTags": ["variety"],
    "cacheTtlHours": 72,
    "extraInstructions": "What to look for when scraping this source"
  }
]

Rules:
- Richmond, VA metro area only
- Must specifically host or produce burlesque
- Do not re-list anything already in the existing sources above
- Verify URLs are real and accessible
- If nothing new is found, output exactly: []
- Output ONLY the JSON array, no prose, no markdown fences
PROMPT_EOF
)

echo "Searching for new sources..."
if ! RESULT=$(claude -p "$PROMPT" --print --output-format text --model sonnet 2>> "$LOG_FILE"); then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Claude failed" >> "$LOG_FILE"
    notify_error "RVA Burlesque" "Source discovery failed" "$LOG_FILE"
    exit 1
fi

NEW_SOURCES=$(echo "$RESULT" | python3 -c "
import sys, json, re
text = sys.stdin.read().strip()
try:
    data = json.loads(text); print(json.dumps(data)); sys.exit(0)
except json.JSONDecodeError:
    pass
m = re.search(r'\[[\s\S]*\]', text)
if m:
    try:
        data = json.loads(m.group()); print(json.dumps(data)); sys.exit(0)
    except json.JSONDecodeError:
        pass
print('[]')
" 2>/dev/null) || NEW_SOURCES="[]"

COUNT=$(echo "$NEW_SOURCES" | python3 -c "import sys,json; print(len(json.loads(sys.stdin.read())))")
touch "$GUARD_FILE"

if [ "$COUNT" -eq 0 ]; then
    echo "No new sources found."
    echo "$(date '+%Y-%m-%d %H:%M:%S') - No new sources" >> "$LOG_FILE"
    exit 0
fi

echo "Found $COUNT new source(s)!"
python3 - "$SOURCES_FILE" "$NEW_SOURCES" <<'PYEOF'
import json, sys
sources_file, new_json = sys.argv[1], sys.argv[2]
with open(sources_file) as f:
    existing = json.load(f)
new = json.loads(new_json)
existing_ids = {s["id"] for s in existing}
added = []
for source in new:
    if source.get("id") and source["id"] not in existing_ids:
        existing.append(source)
        added.append(source["id"])
if added:
    with open(sources_file, "w") as f:
        json.dump(existing, f, indent=2)
        f.write("\n")
    print(f"Added: {added}")
else:
    print("All discovered sources already exist.")
PYEOF

echo "$(date '+%Y-%m-%d %H:%M:%S') - Discovery complete, $COUNT candidate(s)" >> "$LOG_FILE"

cd "$PROJECT_DIR"
if [ -d .git ] && ! git diff --quiet "$SOURCES_FILE" 2>/dev/null; then
    git add "$SOURCES_FILE"
    git commit -m "Add new burlesque sources $(date '+%Y-%m-%d')" >> "$LOG_FILE" 2>&1
    if git remote -v | grep -q origin; then
        git pull --rebase --autostash origin main >> "$LOG_FILE" 2>&1 || true
        if ! git push origin main >> "$LOG_FILE" 2>&1; then
            notify_error "RVA Burlesque" "git push failed (discover)" "$LOG_FILE"
        fi
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Committed new sources" >> "$LOG_FILE"
fi

echo "Done."
