"""Claude-based scraper for burlesque event sources.

Each source listed in scripts/sources.json is scraped by invoking Claude
with Playwright MCP. Results are cached per-source to avoid redundant
calls when the TTL hasn't elapsed.
"""

import json
import subprocess
from pathlib import Path
from typing import Optional

from .base import BaseScraper, Event

SOURCES_FILE = Path(__file__).parent.parent / "sources.json"

SCRAPE_PROMPT = '''You are scraping burlesque shows in Richmond, VA. Use Playwright to visit the URL and extract events.

Visit: {url}

Output a JSON array of events (no markdown, just raw JSON):
[
  {{
    "title": "Event title",
    "date": "YYYY-MM-DD",
    "startTime": "HH:MM",
    "endTime": "HH:MM",
    "location": "Venue name",
    "address": "Full address",
    "cost": "$XX or null",
    "costValue": XX.XX,
    "url": "Direct ticket/event link",
    "description": "1-2 sentence description",
    "tags": ["variety", "themed", "bingo", "festival", "immersive", "adult", "recurring"],
    "registrationStatus": "available|waitlist|closed|sold-out|unknown"
  }}
]

Rules:
- Only include burlesque, cabaret, or variety shows that include burlesque acts
- Only include future events (today or later)
- Extract actual announced dates only — never extrapolate a recurring pattern
- If the page is an Instagram profile or other source without explicit dates, return []
- All times are local Eastern time; format as 24-hour HH:MM
- Output ONLY a valid JSON array, nothing else (no prose, no markdown fences)

{extra_instructions}
'''


class ClaudePlaywrightScraper(BaseScraper):
    """Scrape a single source via Claude + Playwright MCP."""

    def __init__(
        self,
        source_id: str,
        source_url: str,
        default_location: str = "",
        default_address: str = "",
        extra_instructions: str = "",
        default_tags: list[str] | None = None,
    ):
        super().__init__()
        self.source_id = source_id
        self.source_url = source_url
        self.default_location = default_location
        self.default_address = default_address
        self.extra_instructions = extra_instructions
        self.default_tags = default_tags or []

    def scrape(self) -> list[Event]:
        prompt = SCRAPE_PROMPT.format(
            url=self.source_url,
            extra_instructions=self.extra_instructions,
        )

        try:
            result = subprocess.run(
                ["claude", "-p", prompt, "--print", "--output-format", "text", "--model", "sonnet"],
                capture_output=True,
                text=True,
                timeout=600,
            )

            if result.returncode != 0:
                print(f"  [{self.source_id}] Claude error: {result.stderr}")
                return []

            events_data = self._extract_json(result.stdout.strip())
            if events_data is None:
                print(f"  [{self.source_id}] No valid JSON in output")
                return []

            events = []
            for data in events_data:
                events.append(Event(
                    source=self.source_id,
                    source_url=self.source_url,
                    title=data.get("title", ""),
                    date=data.get("date", ""),
                    start_time=data.get("startTime"),
                    end_time=data.get("endTime"),
                    location=data.get("location", self.default_location),
                    address=data.get("address", self.default_address),
                    cost=data.get("cost") or "",
                    cost_value=data.get("costValue"),
                    url=data.get("url", ""),
                    description=data.get("description", ""),
                    tags=data.get("tags") or self.default_tags,
                    status="confirmed",
                    registration_status=data.get("registrationStatus", "unknown"),
                    instructor=data.get("instructor"),
                ))
            return events

        except subprocess.TimeoutExpired:
            print(f"  [{self.source_id}] Claude timed out")
            return []
        except Exception as e:
            print(f"  [{self.source_id}] Error: {e}")
            return []

    def _extract_json(self, text: str) -> Optional[list]:
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        import re
        match = re.search(r"\[[\s\S]*\]", text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return None


def load_sources() -> list[dict]:
    with open(SOURCES_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def create_scraper(source: dict) -> ClaudePlaywrightScraper:
    return ClaudePlaywrightScraper(
        source_id=source["id"],
        source_url=source["url"],
        default_location=source.get("location", ""),
        default_address=source.get("address", ""),
        extra_instructions=source.get("extraInstructions", ""),
        default_tags=source.get("defaultTags"),
    )
