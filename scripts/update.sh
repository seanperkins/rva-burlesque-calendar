#!/bin/bash
# RVA Burlesque - update job.
# Runs scrape.py, regenerates ICS + RSS, commits and pushes if there are changes.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_DIR/site/data"
DATA_FILE="$DATA_DIR/events.json"
CALENDAR_FILE="$DATA_DIR/calendar.ics"
FEED_FILE="$DATA_DIR/feed.xml"
LOG_FILE="$PROJECT_DIR/logs/update.log"
LOCK_FILE="$PROJECT_DIR/.update.lock"

# shellcheck disable=SC1091
source "$SCRIPT_DIR/notify.sh"

cleanup() {
    rm -f "$DATA_FILE.tmp" "$LOCK_FILE"
}
trap cleanup EXIT

if [ -f "$LOCK_FILE" ]; then
    echo "Another update is already running (lock file exists)"
    exit 1
fi
touch "$LOCK_FILE"

mkdir -p "$DATA_DIR" "$(dirname "$LOG_FILE")"
cd "$PROJECT_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') - Starting scrape" >> "$LOG_FILE"

if ! python3 "$SCRIPT_DIR/scrape.py" -o "$DATA_FILE.tmp" >> "$LOG_FILE" 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Scraper failed" >> "$LOG_FILE"
    notify_error "RVA Burlesque" "Scraper failed" "$LOG_FILE"
    rm -f "$DATA_FILE.tmp"
    exit 1
fi

if ! python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$DATA_FILE.tmp" 2>/dev/null; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Invalid JSON output" >> "$LOG_FILE"
    head -100 "$DATA_FILE.tmp" >> "$LOG_FILE"
    notify_error "RVA Burlesque" "Scraper produced invalid JSON" "$LOG_FILE"
    rm -f "$DATA_FILE.tmp"
    exit 1
fi

EVENT_COUNT=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1])).get('events', [])))" "$DATA_FILE.tmp")
if [ "$EVENT_COUNT" -lt 1 ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - No events in scrape output, keeping previous data" >> "$LOG_FILE"
    notify_error "RVA Burlesque" "Scrape returned zero events" "$LOG_FILE"
    rm -f "$DATA_FILE.tmp"
    exit 0
fi

mv "$DATA_FILE.tmp" "$DATA_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') - Scraped $EVENT_COUNT events" >> "$LOG_FILE"

if ! python3 "$SCRIPT_DIR/generate_ics.py" >> "$LOG_FILE" 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - generate_ics failed" >> "$LOG_FILE"
    notify_error "RVA Burlesque" "generate_ics.py failed" "$LOG_FILE"
fi
if ! python3 "$SCRIPT_DIR/generate_rss.py" >> "$LOG_FILE" 2>&1; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - generate_rss failed" >> "$LOG_FILE"
    notify_error "RVA Burlesque" "generate_rss.py failed" "$LOG_FILE"
fi

if [ -d .git ]; then
    if ! git diff --quiet "$DATA_FILE" "$CALENDAR_FILE" "$FEED_FILE" 2>/dev/null; then
        git add "$DATA_FILE" "$CALENDAR_FILE" "$FEED_FILE"
        git commit -m "Update events $(date '+%Y-%m-%d')" >> "$LOG_FILE" 2>&1
        if git remote -v | grep -q origin; then
            git pull --rebase --autostash origin main >> "$LOG_FILE" 2>&1 || true
            if ! git push origin main >> "$LOG_FILE" 2>&1; then
                notify_error "RVA Burlesque" "git push failed" "$LOG_FILE"
            fi
        fi
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Committed and pushed" >> "$LOG_FILE"
    else
        echo "$(date '+%Y-%m-%d %H:%M:%S') - No changes to commit" >> "$LOG_FILE"
    fi
fi

echo "Done."
