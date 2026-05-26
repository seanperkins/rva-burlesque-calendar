"""
Base scraper class with common utilities.
"""

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from html.parser import HTMLParser

from .cache import get_cache


@dataclass
class Event:
    """Normalized event structure."""
    source: str
    source_url: str
    title: str
    date: str  # YYYY-MM-DD
    start_time: Optional[str] = None  # HH:MM
    end_time: Optional[str] = None  # HH:MM
    location: str = ""
    address: str = ""
    cost: str = ""
    cost_value: Optional[float] = None
    url: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    status: str = "confirmed"
    registration_status: str = "unknown"
    instructor: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dict."""
        return {
            "source": self.source,
            "sourceUrl": self.source_url,
            "title": self.title,
            "date": self.date,
            "startTime": self.start_time,
            "endTime": self.end_time,
            "location": self.location,
            "address": self.address,
            "cost": self.cost,
            "costValue": self.cost_value,
            "url": self.url,
            "description": self.description,
            "tags": self.tags,
            "status": self.status,
            "registrationStatus": self.registration_status,
            "instructor": self.instructor,
        }

    def is_future(self) -> bool:
        """Check if event is in the future."""
        today = datetime.now().strftime("%Y-%m-%d")
        return self.date >= today


class JsonLdExtractor(HTMLParser):
    """Extract JSON-LD structured data from HTML."""

    def __init__(self):
        super().__init__()
        self.json_ld_blocks: list[dict] = []
        self._in_json_ld = False
        self._current_data = ""

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            attr_dict = dict(attrs)
            if attr_dict.get("type") == "application/ld+json":
                self._in_json_ld = True
                self._current_data = ""

    def handle_endtag(self, tag):
        if tag == "script" and self._in_json_ld:
            self._in_json_ld = False
            try:
                data = json.loads(self._current_data)
                if isinstance(data, list):
                    self.json_ld_blocks.extend(data)
                else:
                    self.json_ld_blocks.append(data)
            except json.JSONDecodeError:
                pass

    def handle_data(self, data):
        if self._in_json_ld:
            self._current_data += data


def extract_json_ld(html: str) -> list[dict]:
    """Extract all JSON-LD blocks from HTML."""
    parser = JsonLdExtractor()
    parser.feed(html)
    return parser.json_ld_blocks


def find_events_in_json_ld(json_ld_blocks: list[dict]) -> list[dict]:
    """Find Event objects in JSON-LD data."""
    events = []

    def search(obj):
        if isinstance(obj, dict):
            obj_type = obj.get("@type", "")
            if obj_type == "Event" or (isinstance(obj_type, list) and "Event" in obj_type):
                events.append(obj)
            # Check @graph
            if "@graph" in obj:
                for item in obj["@graph"]:
                    search(item)
            # Check nested objects
            for value in obj.values():
                search(value)
        elif isinstance(obj, list):
            for item in obj:
                search(item)

    for block in json_ld_blocks:
        search(block)

    return events


def parse_json_ld_event(event_data: dict, source: str, source_url: str) -> Optional[Event]:
    """Parse a JSON-LD Event into our Event structure."""
    try:
        # Extract date/time
        start = event_data.get("startDate", "")
        end = event_data.get("endDate", "")

        # Parse ISO datetime
        date = ""
        start_time = None
        end_time = None

        if start:
            if "T" in start:
                date = start.split("T")[0]
                time_part = start.split("T")[1]
                start_time = time_part[:5]  # HH:MM
            else:
                date = start[:10]

        if end and "T" in end:
            time_part = end.split("T")[1]
            end_time = time_part[:5]

        # Extract location
        location_data = event_data.get("location", {})
        location = ""
        address = ""

        if isinstance(location_data, dict):
            location = location_data.get("name", "")
            addr = location_data.get("address", {})
            if isinstance(addr, dict):
                parts = [
                    addr.get("streetAddress", ""),
                    addr.get("addressLocality", ""),
                    addr.get("addressRegion", ""),
                    addr.get("postalCode", ""),
                ]
                address = ", ".join(p for p in parts if p)
            elif isinstance(addr, str):
                address = addr
        elif isinstance(location_data, str):
            location = location_data

        # Extract offers/pricing
        cost = ""
        cost_value = None
        offers = event_data.get("offers", {})

        if isinstance(offers, dict):
            price = offers.get("price")
            if price:
                cost_value = float(price)
                currency = offers.get("priceCurrency", "USD")
                cost = f"${cost_value:.2f}" if currency == "USD" else f"{cost_value} {currency}"
        elif isinstance(offers, list) and offers:
            price = offers[0].get("price")
            if price:
                cost_value = float(price)
                cost = f"${cost_value:.2f}"

        return Event(
            source=source,
            source_url=source_url,
            title=event_data.get("name", ""),
            date=date,
            start_time=start_time,
            end_time=end_time,
            location=location,
            address=address,
            cost=cost,
            cost_value=cost_value,
            url=event_data.get("url", source_url),
            description=event_data.get("description", ""),
            tags=["open-session"],  # Default, can be refined
        )
    except Exception as e:
        print(f"Error parsing JSON-LD event: {e}")
        return None


@dataclass
class FetchResult:
    """Result of an HTTP fetch."""
    html: str
    status_code: int
    etag: Optional[str] = None
    last_modified: Optional[str] = None
    from_cache: bool = False
    not_modified: bool = False


class BaseScraper(ABC):
    """Base class for all scrapers."""

    source_id: str = ""
    source_url: str = ""
    default_location: str = ""
    default_address: str = ""

    def __init__(self):
        self.cache = get_cache()
        self.default_tags: list[str] = []

    def fetch(self, url: str, use_cache_headers: bool = True) -> FetchResult:
        """Fetch a URL with optional HTTP caching."""
        headers = {
            "User-Agent": "RVA-Figure-Drawing-Calendar/1.0",
            "Accept": "text/html,application/xhtml+xml",
        }

        # Add cache headers for conditional request
        if use_cache_headers:
            cache_headers = self.cache.get_http_headers(self.source_id)
            headers.update(cache_headers)

        request = Request(url, headers=headers)

        try:
            response = urlopen(request, timeout=30)
            html = response.read().decode("utf-8")

            return FetchResult(
                html=html,
                status_code=response.status,
                etag=response.headers.get("ETag"),
                last_modified=response.headers.get("Last-Modified"),
            )
        except HTTPError as e:
            if e.code == 304:  # Not Modified
                return FetchResult(
                    html="",
                    status_code=304,
                    not_modified=True,
                )
            raise
        except URLError as e:
            raise RuntimeError(f"Failed to fetch {url}: {e}")

    def get_cached_events(self) -> Optional[list[dict]]:
        """Get events from cache if valid."""
        entry = self.cache.get(self.source_id)
        if entry:
            print(f"  [{self.source_id}] Using cached data ({entry.age_minutes()} min old)")
            return entry.events
        return None

    def save_to_cache(
        self,
        events: list[Event],
        etag: Optional[str] = None,
        last_modified: Optional[str] = None,
    ):
        """Save events to cache."""
        self.cache.set(
            source=self.source_id,
            events=[e.to_dict() for e in events],
            url=self.source_url,
            etag=etag,
            last_modified=last_modified,
        )

    def extract_json_ld_events(self, html: str) -> list[Event]:
        """Try to extract events from JSON-LD in the HTML."""
        json_ld = extract_json_ld(html)
        event_data = find_events_in_json_ld(json_ld)

        events = []
        for data in event_data:
            event = parse_json_ld_event(data, self.source_id, self.source_url)
            if event and event.is_future():
                events.append(event)

        return events

    @abstractmethod
    def scrape(self) -> list[Event]:
        """Scrape events from this source. Override in subclasses."""
        pass

    def run(self) -> list[dict]:
        """Run the scraper with caching."""
        # Check cache first
        cached = self.get_cached_events()
        if cached is not None:
            return cached

        print(f"  [{self.source_id}] Scraping fresh data...")
        try:
            events = self.scrape()
            future_events = [e for e in events if e.is_future()]

            # Save to cache
            self.save_to_cache(future_events)

            print(f"  [{self.source_id}] Found {len(future_events)} future events")
            return [e.to_dict() for e in future_events]
        except Exception as e:
            print(f"  [{self.source_id}] Error: {e}")
            # Try to return stale cache if available
            entry = self.cache.cache.get(self.source_id)
            if entry:
                print(f"  [{self.source_id}] Returning stale cache due to error")
                return entry.events
            return []
