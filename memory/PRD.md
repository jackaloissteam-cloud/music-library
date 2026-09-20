# Local Music Indexer — PRD

## Original problem statement (verbatim excerpt)
User wants a self-hosted "Local Music Indexer": scan a local folder for audio, extract
metadata, identify unknown tracks via AcoustID, browse/fix in a dashboard, rename into
/Artist/Album/Track structure and optionally generate AI cover art.

## Stack (agreed with user)
- Backend: FastAPI (Python) — `/app/backend/server.py`
- Frontend: React (CRA + craco) — `/app/frontend/src`
- DB: MongoDB (local, via motor)
- Fingerprinting: `fpcalc` (chromaprint) + pyacoustid → AcoustID Web Service
- Metadata: mutagen (read + write ID3/Vorbis/MP4 tags)
- AI cover art: Emergent LLM Key
    - Gemini Nano Banana (`gemini-3.1-flash-image-preview`)
    - OpenAI GPT Image 1 (`gpt-image-1`)

## User personas
1. Music hoarder / DJ with messy local library.
2. Developer running the container locally who wants a scriptable API + UI.

## Implemented (2026-01-04)
- Backend endpoints
  - `GET /api/config` — capabilities probe (fpcalc/acoustid/llm)
  - `POST /api/seed-sample` / `POST /api/seed-duplicates` — demo data
  - `POST /api/scan` + `GET /api/scan/status` — background folder scan with progress state; now also computes chromaprint fingerprint per track
  - `GET /api/tracks?status=…` — list with status filter
  - `GET /api/stats` — dashboard counters
  - `PATCH /api/tracks/{id}` — edit metadata, optionally write back to file
  - `POST /api/identify` — bulk or targeted AcoustID lookup
  - `POST /api/cover-art` — Nano Banana / GPT Image 1 generation + optional embed to mp3
  - `POST /api/organize` — copy/move into `/Artist/Album/NN - Title.ext`
  - `POST /api/duplicates/scan` — chromaprint hamming similarity grouping (adjustable threshold)
  - `POST /api/duplicates/delete` — remove from DB and/or disk
  - `GET /api/audio/{id}` — audio preview stream (mp3)
- Frontend
  - Dark Swiss / terminal aesthetic (Outfit + JetBrains Mono, orange #FF3300 / green #00FF66 accents)
  - Header w/ live capability status
  - Stats grid + tab switcher (LIBRARY / DUPLICATE FINDER)
  - Scan controls + AcoustID toggle + Seed buttons
  - Filterable, dense track table with FIX + COVER actions
  - FixModal / CoverModal (with model picker + style hint + embed toggle)
  - **DuplicatesPanel** — threshold slider, grouped view with auto-selected non-keepers, DB-only or disk-delete
  - Toast notifications, scan-line progress bar

## Testing
- `/app/test_reports/iteration_1.json` — initial MVP (all pass)
- `/app/test_reports/iteration_2.json` — Duplicate Finder feature (all pass)

## Iteration 3 (2026-09-20)
- **Smart Playlist Generator** — LLM-basiert (Claude Sonnet 4.5 via Emergent LLM key). Endpoint `POST /api/playlists/generate` mit optionalem `seed_track_id` + `prompt` + `count`. Speichert Playlists in `db.playlists`. Endpoints: GET list, GET detail, DELETE, GET `.../export.m3u` (Winamp/VLC/foobar-kompatibel)
- **Persistent Mini-Player** — HTML5-Audio-Bar unten am Screen. Streamt via `/api/audio/{id}`, Play/Pause/Next/Prev, Progress-Bar (klickbar für Seek), Cover-Thumbnail, Queue-Info
- **Neuer Tab** SMART PLAYLISTS mit Generator-Form (Mood/Brief, Seed-Track-Select, Count, Name) und Playlist-Cards mit Expand-to-tracks, Play/M3U/Delete-Actions
- Env-Fix: fpcalc + ffmpeg neu installiert (waren ephemer verloren)

## Backlog (P1)
- Cover art embed for non-mp3 formats (flac/m4a)
- Live progress via WebSocket / SSE instead of polling
- MusicBrainz metadata enrichment (album art, release year) after AcoustID match
- Persistent scan history + activity log page
- Multi-folder / watched-folder support

## Backlog (P2)
- Duplicate detection via acoustic fingerprint hash
- Lyrics fetch (LRCLIB) once identified
- Batch operations: multi-select rows for bulk fix/cover/organize
- Dark/light theme toggle (currently locked dark)
