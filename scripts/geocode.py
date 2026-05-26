#!/usr/bin/env python3
"""Geocode venue addresses from events.json using OpenStreetMap Nominatim.

Caches results in site/data/venues.json so we only ever query each address
once. New addresses get queried with a 1-second delay (per Nominatim's
usage policy) and a descriptive User-Agent.

Run from project root:
    python3 scripts/geocode.py
"""
import json
import time
import urllib.parse
import urllib.request
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVENTS_PATH = ROOT / "site" / "data" / "events.json"
VENUES_PATH = ROOT / "site" / "data" / "venues.json"

USER_AGENT = "RVABurlesqueCalendar/1.0 (https://github.com/seanperkins/rva-burlesque-calendar)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
REQUEST_DELAY_SECONDS = 1.1


def normalize_address(address):
    if not address:
        return None
    return unescape(address.strip()).replace("  ", " ")


def collect_venues(events):
    seen = {}
    for ev in events:
        addr = normalize_address(ev.get("address"))
        if not addr or addr in seen:
            continue
        seen[addr] = {
            "location": ev.get("location"),
            "address": addr,
            "key": addr,
        }
    return list(seen.values())


def geocode(address):
    params = urllib.parse.urlencode({
        "q": address,
        "format": "json",
        "limit": 1,
        "countrycodes": "us",
    })
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{params}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    if not data:
        return None
    return float(data[0]["lat"]), float(data[0]["lon"])


def main():
    events = json.loads(EVENTS_PATH.read_text()).get("events", [])
    cache = {}
    if VENUES_PATH.exists():
        cache = json.loads(VENUES_PATH.read_text())

    venues = collect_venues(events)
    new_count = 0
    fail_count = 0

    for venue in venues:
        key = venue["key"]
        if key in cache:
            continue

        print(f"  Geocoding: {key}")
        try:
            coords = geocode(key)
        except Exception as exc:
            print(f"    ERROR: {exc}")
            fail_count += 1
            time.sleep(REQUEST_DELAY_SECONDS)
            continue

        if not coords:
            print("    no result")
            cache[key] = {"location": venue["location"], "address": key, "lat": None, "lng": None}
            fail_count += 1
        else:
            lat, lng = coords
            print(f"    {lat:.5f}, {lng:.5f}")
            cache[key] = {
                "location": venue["location"],
                "address": key,
                "lat": lat,
                "lng": lng,
            }
            new_count += 1
        time.sleep(REQUEST_DELAY_SECONDS)

    VENUES_PATH.write_text(json.dumps(cache, indent=2) + "\n")
    print(f"\nWrote {VENUES_PATH} — {len(cache)} venues total ({new_count} new, {fail_count} failed)")


if __name__ == "__main__":
    main()
