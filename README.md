# Local Music Indexer

Self-hosted music library scanner + AcoustID identifier + AI cover art generator.
Built with FastAPI + React + MongoDB.

## Features

- **Folder scan** with progress indicator (background task)
- **Metadata extraction** via `mutagen` (ID3, Vorbis, MP4)
- **AcoustID fingerprinting** for unknown tracks (via `fpcalc` + AcoustID Web API)
- **Manual "Fix" editor** with optional write-back to file (ID3/Vorbis)
- **AI cover art** — Gemini Nano Banana or GPT Image 1 (via Emergent LLM key), optional embed into .mp3
- **Library organizer** — copy/move into `/Artist/Album/NN - Title.ext`
- **Duplicate Finder** — chromaprint fingerprint clustering with adjustable similarity threshold, delete from DB and/or disk

## Local Windows install (bequem-Setup)

Voraussetzungen:
1. **Python 3.10+** — https://www.python.org/downloads/windows/
2. **Node.js 18+** und **Yarn** — https://nodejs.org/ , dann `npm install -g yarn`
3. **MongoDB Community** — https://www.mongodb.com/try/download/community (als Windows-Service installieren)
4. **FFmpeg** — https://www.gyan.dev/ffmpeg/builds/ → `ffmpeg-release-full.7z` entpacken → `bin` in `PATH` aufnehmen
5. **Chromaprint fpcalc** — https://acoustid.org/chromaprint → `chromaprint-fpcalc-*-windows.zip` → `fpcalc.exe` in einen `PATH`-Ordner legen

Setup:
```powershell
# nach `git clone` deines Repos
cd emergent-music-bot

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# .env anpassen
copy .env .env.local
# MONGO_URL=mongodb://localhost:27017
# DB_NAME=music_indexer
# ACOUSTID_API_KEY=<dein key>
# EMERGENT_LLM_KEY=<dein universal key>
# MUSIC_LIBRARY_ROOT=D:\Musik   (dein echter Ordner)

uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (neues Terminal)
cd ..\frontend
yarn install
# .env
# REACT_APP_BACKEND_URL=http://localhost:8001
yarn start
```

Öffne http://localhost:3000. Fertig.

## API endpoints (kurz)

| Method | Path | Zweck |
|---|---|---|
| GET | /api/config | Capabilities-Check |
| POST | /api/scan | Ordner scannen |
| GET | /api/scan/status | Fortschritt |
| GET | /api/tracks | Liste (Filter: `?status=...`) |
| PATCH | /api/tracks/{id} | Tags bearbeiten (`apply_to_file` = write-back) |
| POST | /api/identify | AcoustID-Lookup (bulk oder gezielt) |
| POST | /api/cover-art | Cover generieren (Nano Banana / GPT Image 1) |
| POST | /api/organize | In /Artist/Album kopieren |
| POST | /api/duplicates/scan | Duplikate finden |
| POST | /api/duplicates/delete | Duplikate löschen (DB + optional Disk) |
| POST | /api/seed-sample | Demo-Daten |
| POST | /api/seed-duplicates | Demo-Duplikate |

## Repo Struktur

```
/app
├── backend/
│   ├── server.py          # FastAPI + scan/identify/organize/dupes/cover
│   ├── requirements.txt
│   └── .env
└── frontend/
    └── src/
        ├── App.js
        ├── components/
        │   ├── Dashboard.jsx
        │   ├── ScanControls.jsx
        │   ├── StatsRow.jsx
        │   ├── TrackTable.jsx
        │   ├── FixModal.jsx
        │   ├── CoverModal.jsx
        │   └── DuplicatesPanel.jsx
        └── testIds.js
```
