"""Claude-based scraper for burlesque event sources.

Each source listed in scripts/sources.json is scraped by invoking Claude
with the ml:scrape skill (agent-browser CLI). Results are cached per-source
to avoid redundant calls when the TTL hasn't elapsed.
"""

import json
import subprocess
from pathlib import Path
from typing import Optional

from .base import BaseScraper, Event

SOURCES_FILE = Path(__file__).parent.parent / "sources.json"

SCRAPE_PROMPT = '''You are scraping burlesque shows in Richmond, VA. Use the ml:scrape skill to visit the URL and extract events; it drives the agent-browser CLI. Do not use Playwright.

Visit: {url}

Report only what you actually saw rendered on the page. If the page did not
load, was blocked by a login wall or bot check, or showed no event details,
return [] — never reconstruct events from alt-text, link slugs, memory, or
what a venue "usually" schedules.

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
- Every event you emit must have its date visible in the page content you
  retrieved. If you cannot point to where a date appeared, drop the event.
  Returning [] is always correct when the page did not render — a partial or
  empty result is useful, an invented one corrupts the calendar.
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
                ["onecli", "run", "--", "claude", "-p", prompt, "--print", "--output-format", "text", "--model", "sonnet"],
                capture_output=True,
                text=True,
                timeout=600,
            )

            if result.returncode != 0:
                raise RuntimeError(f"Claude error: {result.stderr.strip() or result.stdout.strip()}")

            events_data = self._extract_json(result.stdout.strip())
            if events_data is None:
                raise RuntimeError("No valid JSON in output")

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

        # Failures raise rather than returning [] so BaseScraper.run() doesn't
        # cache them as a valid empty result.
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("Claude timed out") from e

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
