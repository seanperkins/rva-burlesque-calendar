# RVA Burlesque Calendar

A static site aggregating burlesque shows in Richmond, VA.

## Live Site

[**https://seanperkins.github.io/rva-burlesque-calendar/**](https://seanperkins.github.io/rva-burlesque-calendar/)

## How It Works

1. Event data lives in `site/data/events.json`.
2. GitHub Pages serves the static `site/` directory.
3. The site reads the JSON and renders a filterable list + calendar view.
4. `scripts/generate_ics.py` regenerates `site/data/calendar.ics` from the JSON for calendar subscriptions.

## Event statuses

- `confirmed` — date and venue verified.
- `tentative` — date inferred from a recurring pattern (e.g. Gallery5's 3rd-Saturday cadence). UI marks these clearly and the ICS title includes "(tentative)".
- `dateTBA: true` — known recurring show, specific date not yet announced. Shown in a separate "watch this space" section and skipped from the calendar grid and the ICS file.

## Adding an event

Add an object to the `events` array in `site/data/events.json` using the schema below, then re-run the ICS generator:

```json
{
  "source": "gallery5",
  "sourceUrl": "https://gallery5arts.org/calendar",
  "title": "Gallery5 Burlesque Night",
  "date": "2026-06-20",
  "tentative": true,
  "tentativeReason": "Inferred from Gallery5's recurring 3rd-Saturday pattern.",
  "startTime": null,
  "endTime": null,
  "location": "Gallery5",
  "address": "200 W Marshall St, Richmond, VA 23220",
  "cost": null,
  "costValue": null,
  "url": "https://gallery5arts.org/calendar",
  "description": "Recurring 3rd-Saturday burlesque night.",
  "tags": ["variety", "recurring"],
  "status": "tentative",
  "registrationStatus": "unknown",
  "instructor": null
}
```

For a Date-TBA event, omit `date` and set `dateTBA: true` plus `expectedMonth: "2026-08"` for ordering.

```bash
python3 scripts/generate_ics.py
```

## Local Development

```bash
cd site
python3 -m http.server 8000
# visit http://localhost:8000
```

## Deployment

Push to `main`. The workflow in `.github/workflows/deploy.yml` publishes the `site/` directory to GitHub Pages. Enable Pages → "Build from GitHub Actions" in repo settings on first deploy.

## Sources tracked

- [Gallery5](https://gallery5arts.org/calendar)
- [Burlesque Right Meow](https://linktr.ee/burlesquerightmeow) (Pours and Pasties, themed productions)
- [Ember Music Hall](https://embermusichall.com/events/category/series/burlesque-shows/ember-music-hall/richmond-virginia/)
- [Firehouse Theatre](https://www.firehousetheatre.org/)
- [Blue Bee Cider](https://www.visitrichmondva.com/event/rva-burlesque-bingo/49647/) (RVA Burlesque Bingo)
- [RVA Burlesque Festival](https://rvaburlesquefestival.com/)
