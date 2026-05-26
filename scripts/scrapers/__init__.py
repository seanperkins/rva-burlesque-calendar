"""RVA Burlesque - scraper package.

Exposes `run_all_scrapers()` which calls each source defined in
scripts/sources.json (via Claude + Playwright) and returns the combined
event list. Uses scripts/.cache for source-level caching with TTLs.
"""

from .base import BaseScraper, Event
from .cache import get_cache, ScraperCache, SOURCE_TTLS
from .merge import merge_events, summarize_merge

__all__ = [
    "get_cache",
    "ScraperCache",
    "SOURCE_TTLS",
    "Event",
    "BaseScraper",
    "merge_events",
    "summarize_merge",
    "run_all_scrapers",
]


def run_all_scrapers(
    force_refresh: bool = False,
    sources: list[str] | None = None,
) -> list[dict]:
    from .claude_scraper import load_sources, create_scraper

    all_source_configs = load_sources()
    all_scrapers = {cfg["id"]: cfg for cfg in all_source_configs}

    if sources:
        scrapers_to_run = {k: v for k, v in all_scrapers.items() if k in sources}
    else:
        scrapers_to_run = all_scrapers

    cache = get_cache()
    if force_refresh:
        for source_id in scrapers_to_run:
            cache.invalidate(source_id)
        print(f"Cache cleared for: {list(scrapers_to_run.keys())}")

    print(f"Running {len(scrapers_to_run)} scrapers: {list(scrapers_to_run.keys())}")

    cached_events: list[dict] = []
    scrapers_needed: list[tuple[str, dict]] = []

    for source_id, config in scrapers_to_run.items():
        entry = cache.get(source_id)
        if entry and not force_refresh:
            print(f"  [{source_id}] Using cache ({entry.age_minutes()} min old, {len(entry.events)} events)")
            cached_events.extend(entry.events)
        else:
            scrapers_needed.append((source_id, config))

    all_events: list[dict] = list(cached_events)

    if scrapers_needed:
        print(f"Scraping {len(scrapers_needed)} sources: {[s[0] for s in scrapers_needed]}")
        for source_id, config in scrapers_needed:
            scraper = create_scraper(config)
            try:
                scraped = scraper.run()
                cache.set(source_id, scraped, url=config.get("url"))
                all_events.extend(scraped)
            except Exception as e:
                print(f"  [{source_id}] Failed: {e}")

    # Sort by date and de-dupe (same key as merge.py)
    all_events.sort(key=lambda e: (e.get("date") or "", e.get("startTime") or ""))
    seen = set()
    unique: list[dict] = []
    for ev in all_events:
        key = (ev.get("date"), (ev.get("location") or "").strip().lower(), ev.get("startTime"))
        if key not in seen:
            seen.add(key)
            unique.append(ev)
    print(f"\nTotal scraped: {len(unique)} unique events")
    return unique
