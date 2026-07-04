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
  - `POST /api/seed-sample` — generates 5 synthetic mp3s for demo
  - `POST /api/scan` + `GET /api/scan/status` — background folder scan with progress state
  - `GET /api/tracks?status=…` — list with status filter
  - `GET /api/stats` — dashboard counters
  - `PATCH /api/tracks/{id}` — edit metadata, optionally write back to file
  - `POST /api/identify` — bulk or targeted AcoustID lookup
  - `POST /api/cover-art` — Nano Banana / GPT Image 1 generation + optional embed to mp3
  - `POST /api/organize` — copy/move into `/Artist/Album/NN - Title.ext`
  - `GET /api/audio/{id}` — audio preview stream (mp3)
- Frontend
  - Dark Swiss / terminal aesthetic (Outfit + JetBrains Mono, orange #FF3300 / green #00FF66 accents)
  - Header w/ live capability status
  - Stats grid (Total / Identified / Low-Confidence / Unknown)
  - Scan controls + AcoustID toggle + Seed button
  - Filterable, dense track table with FIX + COVER actions
  - FixModal (edit tags, optional write-to-file, AcoustID re-try)
  - CoverModal (model picker, style hint, embed toggle, preview)
  - Toast notifications, scan-line progress bar

## Environment
- `/app/backend/.env`: `EMERGENT_LLM_KEY`, `ACOUSTID_API_KEY`, `MUSIC_LIBRARY_ROOT=/app/music_library`, `SAMPLE_MUSIC_ROOT=/app/sample_music`
- Requires system packages: `libchromaprint-tools`, `ffmpeg` (installed in container)

## Testing
- `/app/test_reports/iteration_1.json` — all endpoints and UI flows pass.
- Note: synthetic sine-wave samples don't match AcoustID → expected `errors` on identify.

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
