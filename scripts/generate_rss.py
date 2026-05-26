#!/usr/bin/env python3
"""Generate site/data/feed.xml (RSS 2.0) from site/data/events.json."""
import json
from datetime import datetime, timezone
from email.utils import format_datetime
from html import escape
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "site" / "data" / "events.json"
RSS_PATH = ROOT / "site" / "data" / "feed.xml"

SITE_URL = "https://seanperkins.github.io/rva-burlesque-calendar/"
FEED_URL = "https://seanperkins.github.io/rva-burlesque-calendar/data/feed.xml"
CHANNEL_TITLE = "RVA Burlesque"
CHANNEL_DESCRIPTION = (
    "Burlesque shows in Richmond, VA. Items are sorted by event date. "
    "Entries marked [TBD] have inferred dates pending venue confirmation."
)


def rfc822(dt):
    return format_datetime(dt)


def event_pubdate_utc(event):
    date_str = event.get("date")
    if not date_str:
        return datetime.now(timezone.utc)
    start = event.get("startTime") or "12:00"
    try:
        dt = datetime.strptime(f"{date_str} {start}", "%Y-%m-%d %H:%M")
    except ValueError:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    return dt.replace(tzinfo=timezone.utc)


def format_time_range(start, end):
    if not start:
        return ""

    def fmt(t):
        h, m = (int(x) for x in t.split(":"))
        ampm = "pm" if h >= 12 else "am"
        hour = h % 12 or 12
        return f"{hour}{ampm}" if m == 0 else f"{hour}:{m:02d}{ampm}"

    if not end:
        return fmt(start)
    return f"{fmt(start)} – {fmt(end)}"


def build_description(event):
    lines = []
    if event.get("tentative"):
        lines.append("<p><em>[Tentative date — confirm with the venue before going.]</em></p>")

    date_obj = datetime.strptime(event["date"], "%Y-%m-%d") if event.get("date") else None
    date_str = date_obj.strftime("%A, %B %-d, %Y") if date_obj else "Date TBA"
    time_str = format_time_range(event.get("startTime"), event.get("endTime"))
    when = f"{date_str}" + (f" · {time_str}" if time_str else "")
    lines.append(f"<p><strong>When:</strong> {escape(when)}</p>")

    loc = event.get("location") or ""
    if event.get("address"):
        loc = f"{loc}, {event['address']}" if loc else event["address"]
    if loc:
        lines.append(f"<p><strong>Where:</strong> {escape(loc)}</p>")

    if event.get("cost"):
        lines.append(f"<p><strong>Cost:</strong> {escape(event['cost'])}</p>")

    if event.get("description"):
        lines.append(f"<p>{escape(event['description'])}</p>")

    if event.get("tentativeReason"):
        lines.append(f"<p><small>{escape(event['tentativeReason'])}</small></p>")

    return "".join(lines)


def item_xml(event):
    title = event.get("title", "Untitled show")
    link = event.get("url") or SITE_URL
    description = build_description(event)
    pub = rfc822(event_pubdate_utc(event))
    uid_time = (event.get("startTime") or "0000").replace(":", "")
    guid = f"{event.get('date', 'tba')}-{uid_time}-{event.get('source', 'src')}@rvaburlesque"

    category_lines = "".join(
        f"    <category>{xml_escape(tag)}</category>\n" for tag in event.get("tags", [])
    )

    return (
        "  <item>\n"
        f"    <title>{xml_escape(title)}</title>\n"
        f"    <link>{xml_escape(link)}</link>\n"
        f"    <guid isPermaLink=\"false\">{xml_escape(guid)}</guid>\n"
        f"    <pubDate>{pub}</pubDate>\n"
        f"    <description><![CDATA[{description}]]></description>\n"
        f"{category_lines}"
        "  </item>\n"
    )


def main():
    data = json.loads(EVENTS_PATH.read_text())
    events = [e for e in data.get("events", []) if e.get("date")]
    events.sort(key=lambda e: (e["date"], e.get("startTime") or ""))

    build_dt = datetime.now(timezone.utc)
    if data.get("lastUpdated"):
        try:
            build_dt = datetime.fromisoformat(data["lastUpdated"].replace("Z", "+00:00"))
        except ValueError:
            pass

    items = "".join(item_xml(e) for e in events)

    feed = (
        '<?xml version="1.0" encoding="UTF-8" ?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "<channel>\n"
        f"  <title>{xml_escape(CHANNEL_TITLE)}</title>\n"
        f"  <link>{xml_escape(SITE_URL)}</link>\n"
        f"  <description>{xml_escape(CHANNEL_DESCRIPTION)}</description>\n"
        f'  <atom:link href="{xml_escape(FEED_URL)}" rel="self" type="application/rss+xml" />\n'
        "  <language>en-us</language>\n"
        f"  <lastBuildDate>{rfc822(build_dt)}</lastBuildDate>\n"
        "  <generator>scripts/generate_rss.py</generator>\n"
        f"{items}"
        "</channel>\n"
        "</rss>\n"
    )

    RSS_PATH.write_text(feed)
    print(f"Wrote {RSS_PATH} ({len(events)} items)")


if __name__ == "__main__":
    main()
