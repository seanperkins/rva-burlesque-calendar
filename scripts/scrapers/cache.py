"""
Caching layer for scrapers with source-specific TTLs and HTTP caching.
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
from dataclasses import dataclass, asdict

# Cache file location
CACHE_DIR = Path(__file__).parent.parent.parent / ".cache"
CACHE_FILE = CACHE_DIR / "scraper_cache.json"

# Sources config
SOURCES_FILE = Path(__file__).parent.parent / "sources.json"

DEFAULT_TTL_HOURS = 168  # 7 days - scraper runs weekly


def _load_source_ttls() -> dict[str, int]:
    """Load TTLs from sources.json."""
    ttls = {"default": DEFAULT_TTL_HOURS}
    try:
        with open(SOURCES_FILE, "r", encoding="utf-8") as f:
            sources = json.load(f)
        for source in sources:
            ttls[source["id"]] = source.get("cacheTtlHours", DEFAULT_TTL_HOURS)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return ttls


SOURCE_TTLS = _load_source_ttls()


@dataclass
class CacheEntry:
    """A cached scrape result."""
    source: str
    events: list
    scraped_at: str  # ISO timestamp
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    url: Optional[str] = None

    def is_expired(self) -> bool:
        """Check if this cache entry has expired based on source TTL."""
        ttl_hours = SOURCE_TTLS.get(self.source, SOURCE_TTLS["default"])
        scraped_time = datetime.fromisoformat(self.scraped_at)
        expiry = scraped_time + timedelta(hours=ttl_hours)
        return datetime.now() > expiry

    def age_minutes(self) -> int:
        """Return the age of this cache entry in minutes."""
        scraped_time = datetime.fromisoformat(self.scraped_at)
        delta = datetime.now() - scraped_time
        return int(delta.total_seconds() / 60)


class ScraperCache:
    """Manages caching for all scrapers."""

    def __init__(self):
        self.cache: dict[str, CacheEntry] = {}
        self._load()

    def _load(self):
        """Load cache from disk."""
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for source, entry_data in data.items():
                        self.cache[source] = CacheEntry(**entry_data)
            except (json.JSONDecodeError, TypeError) as e:
                print(f"Warning: Could not load cache: {e}")
                self.cache = {}

    def _save(self):
        """Save cache to disk."""
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            data = {source: asdict(entry) for source, entry in self.cache.items()}
            json.dump(data, f, indent=2)

    def get(self, source: str) -> Optional[CacheEntry]:
        """Get cached entry for a source if valid."""
        entry = self.cache.get(source)
        if entry and not entry.is_expired():
            return entry
        return None

    def get_http_headers(self, source: str) -> dict[str, str]:
        """Get HTTP caching headers for conditional requests."""
        entry = self.cache.get(source)
        headers = {}
        if entry:
            if entry.etag:
                headers["If-None-Match"] = entry.etag
            if entry.last_modified:
                headers["If-Modified-Since"] = entry.last_modified
        return headers

    def set(
        self,
        source: str,
        events: list,
        url: Optional[str] = None,
        etag: Optional[str] = None,
        last_modified: Optional[str] = None,
    ):
        """Cache scrape results for a source."""
        self.cache[source] = CacheEntry(
            source=source,
            events=events,
            scraped_at=datetime.now().isoformat(),
            url=url,
            etag=etag,
            last_modified=last_modified,
        )
        self._save()

    def invalidate(self, source: str):
        """Invalidate cache for a source."""
        if source in self.cache:
            del self.cache[source]
            self._save()

    def invalidate_all(self):
        """Clear all cached data."""
        self.cache = {}
        self._save()

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        stats = {
            "total_sources": len(self.cache),
            "sources": {},
        }
        for source, entry in self.cache.items():
            stats["sources"][source] = {
                "event_count": len(entry.events),
                "age_minutes": entry.age_minutes(),
                "expired": entry.is_expired(),
                "has_etag": entry.etag is not None,
            }
        return stats


# Singleton instance
_cache_instance: Optional[ScraperCache] = None


def get_cache() -> ScraperCache:
    """Get the singleton cache instance."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = ScraperCache()
    return _cache_instance
