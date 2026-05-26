#!/usr/bin/env python3
"""RVA Burlesque - scrape orchestrator.

Calls each source listed in scripts/sources.json via Claude + Playwright,
merges the results into the current site/data/events.json (promoting
tentative entries when a scraped event covers the same source + month),
and writes the result.

Usage:
    python3 scrape.py                    # normal run with caching
    python3 scrape.py --force            # ignore cache
    python3 scrape.py --stats            # show cache stats
    python3 scrape.py --clear-cache      # clear all cached source data
    python3 scrape.py -o path/events.json
    python3 scrape.py -s gallery5,ember  # only specific sources
"""

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from scrapers import (  # noqa: E402
    get_cache,
    merge_events,
    run_all_scrapers,
    summarize_merge,
)

DEFAULT_DATA_FILE = Path(__file__).parent.parent / "site" / "data" / "events.json"


def main():
    parser = argparse.ArgumentParser(description="Scrape RVA burlesque events")
    parser.add_argument("--force", action="store_true", help="Force refresh, ignore cache")
    parser.add_argument("--stats", action="store_true", help="Show cache statistics")
    parser.add_argument("--clear-cache", action="store_true", help="Clear all cached data")
    parser.add_argument("--output", "-o", type=str, help="Output file path (default: site/data/events.json)")
    parser.add_argument("--sources", "-s", type=str, help="Comma-separated list of source IDs to scrape")
    parser.add_argument("--no-merge", action="store_true", help="Write scraped events only (skip merge with existing)")
    args = parser.parse_args()

    cache = get_cache()

    if args.stats:
        stats = cache.get_stats()
        print("Cache Statistics:")
        print(f"  Total sources cached: {stats['total_sources']}")
        for source, info in stats.get("sources", {}).items():
            status = "EXPIRED" if info["expired"] else "valid"
            print(f"  - {source}: {info['event_count']} events, {info['age_minutes']} min old ({status})")
        return

    if args.clear_cache:
        cache.invalidate_all()
        print("Cache cleared")
        return

    sources = [s.strip() for s in args.sources.split(",")] if args.sources else None
    scraped_events = run_all_scrapers(force_refresh=args.force, sources=sources)

    output_path = Path(args.output) if args.output else DEFAULT_DATA_FILE

    existing_events = []
    if output_path.exists() and not args.no_merge:
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                existing_events = json.load(f).get("events", [])
        except (json.JSONDecodeError, FileNotFoundError):
            existing_events = []

    if args.no_merge:
        merged = scraped_events
    else:
        merged = merge_events(existing_events, scraped_events)
        diff = summarize_merge(existing_events, merged)
        print(
            f"\nMerge: before={diff['before_count']} after={diff['after_count']} "
            f"added={diff['added']} removed={diff['removed']}"
        )

    output = {
        "lastUpdated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "events": merged,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
        f.write("\n")
    print(f"Wrote {len(merged)} events to {output_path}")


if __name__ == "__main__":
    main()
