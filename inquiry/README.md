# inquiry

## Live reading map (`/inquiry/atlas/`)

A staff-only, Google-Analytics-style live map of what signed-in readers are reading.

- **Map**: a treemap of the library's categories. Every catalog index has a fixed spot
  (`static/inquiry/atlas-baseline.json`).
- **Circle size**: reads per book across the newest 500 primary `user_history` records
  (rolling, so the map starts with a baseline and keeps adjusting as people read).
- **Halo**: a ring pulses out of a book each time someone reads it.
- **Moving dot**: when a reader's new history record is for a different book than their
  previous one, a dot travels along a curved path from the old book to the new one.
- **Numbers**: zoom in (or look at the side panel/tooltips) to see how many people are on a
  book right now, meaning readers whose latest read in the last 30 minutes is that book.

### Data flow

```
user_history ──(Celery beat, every 5s: inquiry.refresh_activity)──▶ inquiry_activity_snapshots.latest
                                                                       │
browser ◀──(poll every 5s: /inquiry/api/atlas/activity/)───────────────┘
```

`atlas.build_snapshot` produces `sizes`, `readers`, and `events` (reads from the last 60s,
each with the book the same reader came `from`). Reader ids never leave the server. The
client replays events with their original spacing, delayed by one poll interval, so
motion looks continuous.

Primary reads only: sidebar (`secondary`) opens, bookmarks and sheets are excluded.
Anonymous readers and readers with history turned off are not in `user_history`.

### Running it

Enable `INQUIRY_ATLAS_ENABLED=1` on web and workers, then run
`python manage.py prepare_inquiry_atlas` once to create the history indexes and write the
first snapshot. Only one Celery beat should schedule the task. A lease document in the
snapshot collection keeps concurrent workers from overlapping.

Standalone local rehearsal (SQLite auth, local Mongo, separate Celery queue):

```sh
.venv312/bin/celery -A inquiry.pilot_celery:app worker -Q inquiry-atlas-local --pool=solo --beat
python -m django runserver 8100 --settings=inquiry.pilot_settings
```

The front end is `static/js/inquiry-atlas.jsx`, `static/js/inquiry/LearningActivityAtlas.jsx`
and `static/js/inquiry/atlasCanvas.js`. Build it with `npm run build-inquiry-atlas`.

### Demo feed

Local traffic is sparse, so there is a synthetic feed. Set `INQUIRY_ATLAS_DEMO_ENABLED=1` on
the web process, the worker, and this command:

```sh
INQUIRY_ATLAS_DEMO_ENABLED=1 python -m django demo_inquiry_atlas --settings=inquiry.pilot_settings --readers=25 --interval=0.5 --duration=600
```

Fake readers wander between base texts and their commentaries (Genesis ↔ Rashi on Genesis,
Berakhot ↔ Tosafot, …). Records go to a separate `inquiry_atlas_demo_history` collection
(loopback Mongo only, TTL 10 minutes), never to `user_history`, and the UI shows a demo banner.
