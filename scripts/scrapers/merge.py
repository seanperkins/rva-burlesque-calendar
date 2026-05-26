"""Merge scraped events with the existing events.json.

Strategy ("promote when found"):
- Scraped events are always confirmed.
- An existing tentative entry is dropped if a scraped confirmed event
  shares its source and falls in the same calendar month.
- All other existing entries (confirmed or unmatched tentatives) survive.
- Within the surviving set, duplicates (same date + location + start time)
  are deduplicated, with confirmed entries winning over tentatives.
"""

from typing import Iterable


def _month_key(date_str: str) -> str:
    if not date_str:
        return ""
    return date_str[:7]


def _dedupe_key(event: dict) -> tuple:
    return (
        event.get("date") or "",
        (event.get("location") or "").strip().lower(),
        event.get("startTime") or "",
    )


def merge_events(existing: list[dict], scraped: list[dict]) -> list[dict]:
    """Return the merged event list.

    `existing` is whatever is currently in site/data/events.json.
    `scraped` is the freshly scraped set (all confirmed).
    """

    # Index scraped events by source -> set of YYYY-MM month keys
    scraped_months: dict[str, set[str]] = {}
    for ev in scraped:
        src = ev.get("source")
        month = _month_key(ev.get("date"))
        if not src or not month:
            continue
        scraped_months.setdefault(src, set()).add(month)

    # Drop tentative entries that have been superseded by scraped confirmations
    survivors: list[dict] = []
    for ev in existing:
        if ev.get("tentative") and not ev.get("dateTBA"):
            src = ev.get("source")
            month = _month_key(ev.get("date"))
            if src and month and month in scraped_months.get(src, set()):
                continue
        survivors.append(ev)

    # Combine survivors + scraped, then de-duplicate
    combined: list[dict] = list(survivors) + list(scraped)
    seen: dict[tuple, dict] = {}
    for ev in combined:
        key = _dedupe_key(ev)
        if key not in seen:
            seen[key] = ev
            continue
        # Conflict: prefer confirmed over tentative
        incumbent = seen[key]
        if incumbent.get("tentative") and not ev.get("tentative"):
            seen[key] = ev

    # Stable sort by date then start time
    merged = list(seen.values())
    merged.sort(
        key=lambda e: (
            e.get("date") or "9999-12-31",
            e.get("startTime") or "",
        )
    )
    return merged


def summarize_merge(before: Iterable[dict], after: Iterable[dict]) -> dict:
    before_list = list(before)
    after_list = list(after)
    before_keys = {_dedupe_key(e) for e in before_list}
    after_keys = {_dedupe_key(e) for e in after_list}
    return {
        "before_count": len(before_list),
        "after_count": len(after_list),
        "added": len(after_keys - before_keys),
        "removed": len(before_keys - after_keys),
    }
