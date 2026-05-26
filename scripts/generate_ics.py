#!/usr/bin/env python3
"""Generate site/data/calendar.ics from site/data/events.json.

Skips events with dateTBA: true. Marks tentative events in the SUMMARY.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "site" / "data" / "events.json"
ICS_PATH = ROOT / "site" / "data" / "calendar.ics"


def escape_ics(s):
    if not s:
        return ""
    return (s.replace("\\", "\\\\")
             .replace(";", "\\;")
             .replace(",", "\\,")
             .replace("\n", "\\n"))


def fold(line):
    max_len = 75
    if len(line) <= max_len:
        return line
    out = [line[:max_len]]
    pos = max_len
    while pos < len(line):
        out.append(" " + line[pos:pos + max_len - 1])
        pos += max_len - 1
    return "\r\n".join(out)


def fmt_date(d):
    return d.replace("-", "")


def add_hours(time_str, hours):
    h, m = (int(x) for x in time_str.split(":"))
    h = (h + hours) % 24
    return f"{h:02d}:{m:02d}"


def event_lines(event):
    if event.get("dateTBA") or event.get("tentative"):
        return []
    date = event.get("date")
    if not date:
        return []

    lines = ["BEGIN:VEVENT"]
    uid_time = (event.get("startTime") or "0000").replace(":", "")
    lines.append(f"UID:{date}-{uid_time}-{event['source']}@rvaburlesque")
    lines.append(f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}")

    start_time = event.get("startTime")
    end_time = event.get("endTime")
    end_date = event.get("endDate") or date

    if start_time:
        if not end_time:
            end_time = add_hours(start_time, 2)
        lines.append(f"DTSTART:{fmt_date(date)}T{start_time.replace(':', '')}00")
        lines.append(f"DTEND:{fmt_date(end_date)}T{end_time.replace(':', '')}00")
    else:
        end_dt = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        lines.append(f"DTSTART;VALUE=DATE:{fmt_date(date)}")
        lines.append(f"DTEND;VALUE=DATE:{end_dt.strftime('%Y%m%d')}")

    lines.append(fold(f"SUMMARY:{escape_ics(event['title'])}"))

    location = event.get("location") or ""
    if event.get("address"):
        location = f"{location}, {event['address']}" if location else event["address"]
    if location:
        lines.append(fold(f"LOCATION:{escape_ics(location)}"))

    desc_parts = []
    if event.get("description"):
        desc_parts.append(event["description"])
    if event.get("cost"):
        desc_parts.append(f"Cost: {event['cost']}")
    if event.get("url"):
        desc_parts.append(f"Info: {event['url']}")
    if desc_parts:
        sep = escape_ics(chr(10) + chr(10))
        desc = sep.join(escape_ics(p) for p in desc_parts)
        lines.append(fold(f"DESCRIPTION:{desc}"))


    if event.get("url"):
        lines.append(f"URL:{event['url']}")

    lines.append("END:VEVENT")
    return lines


def main():
    data = json.loads(EVENTS_PATH.read_text())
    events = data.get("events", [])

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//RVA Burlesque//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:RVA Burlesque",
        "X-WR-CALDESC:Burlesque shows in Richmond, VA",
    ]

    for event in events:
        lines.extend(event_lines(event))

    lines.append("END:VCALENDAR")
    ICS_PATH.write_text("\r\n".join(lines) + "\r\n")
    print(f"Wrote {ICS_PATH}")


if __name__ == "__main__":
    main()
