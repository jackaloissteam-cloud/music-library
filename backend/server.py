"""
Local Music Indexer — FastAPI backend
Scans a local folder for audio files, extracts metadata (mutagen), optionally
identifies unknown tracks via AcoustID fingerprinting, and stores everything
in MongoDB. Also offers AI cover-art generation via Emergent LLM (Gemini
Nano Banana or GPT Image 1).
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import re
import shutil
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import FileResponse
from motor.motor_asyncio import AsyncIOMotorClient
from mutagen import File as MutagenFile
from mutagen.easyid3 import EasyID3
from mutagen.id3 import APIC, ID3, ID3NoHeaderError, TALB, TIT2, TPE1
from mutagen.mp3 import MP3
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.cors import CORSMiddleware

# ---------------------------------------------------------------------------
# Boot
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("music-indexer")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY")
ACOUSTID_API_KEY = os.environ.get("ACOUSTID_API_KEY")
DEFAULT_LIBRARY_ROOT = os.environ.get("MUSIC_LIBRARY_ROOT", "/app/music_library")
SAMPLE_MUSIC_ROOT = os.environ.get("SAMPLE_MUSIC_ROOT", "/app/sample_music")
COVER_OUT_DIR = Path("/app/generated_covers")
COVER_OUT_DIR.mkdir(parents=True, exist_ok=True)

AUDIO_EXTENSIONS = {".mp3", ".flac", ".m4a", ".ogg", ".opus", ".wav", ".aac"}

app = FastAPI(title="Local Music Indexer")
api_router = APIRouter(prefix="/api")


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class Track(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    path: str
    filename: str
    size_bytes: int = 0
    duration: Optional[float] = None
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    genre: Optional[str] = None
    track_number: Optional[str] = None
    has_cover: bool = False
    status: Literal["identified", "unknown", "low_confidence", "error"] = "unknown"
    source: Literal["tags", "acoustid", "manual", "none"] = "none"
    confidence: float = 0.0
    acoustid_id: Optional[str] = None
    musicbrainz_recording_id: Optional[str] = None
    cover_data_url: Optional[str] = None
    error: Optional[str] = None
    fingerprint: Optional[str] = None
    fp_duration: Optional[float] = None
    updated_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class ScanRequest(BaseModel):
    folder: Optional[str] = None
    use_acoustid: bool = False


class ScanState(BaseModel):
    running: bool = False
    folder: Optional[str] = None
    total: int = 0
    processed: int = 0
    identified: int = 0
    unknown: int = 0
    errors: int = 0
    current_file: Optional[str] = None
    finished_at: Optional[str] = None


class IdentifyRequest(BaseModel):
    track_ids: Optional[List[str]] = None  # None => all unknown/low_confidence


class UpdateTrackRequest(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    year: Optional[str] = None
    genre: Optional[str] = None
    track_number: Optional[str] = None
    apply_to_file: bool = False


class CoverArtRequest(BaseModel):
    track_id: str
    model: Literal["nano-banana", "gpt-image-1"] = "nano-banana"
    style_hint: Optional[str] = None
    embed_in_file: bool = False


class OrganizeRequest(BaseModel):
    track_ids: Optional[List[str]] = None
    destination: Optional[str] = None  # default: alongside library
    mode: Literal["copy", "move"] = "copy"


class ConfigResponse(BaseModel):
    library_root: str
    sample_root: str
    acoustid_configured: bool
    llm_configured: bool
    fpcalc_available: bool


# ---------------------------------------------------------------------------
# In-memory scan state
# ---------------------------------------------------------------------------
SCAN_STATE = ScanState()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _read_tags(path: Path) -> dict:
    """Extract tags + duration + cover-present flag from an audio file."""
    out = {
        "title": None,
        "artist": None,
        "album": None,
        "year": None,
        "genre": None,
        "track_number": None,
        "duration": None,
        "has_cover": False,
    }
    try:
        audio = MutagenFile(str(path))
        if audio is None:
            return out
        if getattr(audio, "info", None) is not None:
            out["duration"] = float(getattr(audio.info, "length", 0.0)) or None

        tags = audio.tags
        if tags is None:
            return out

        def _first(key: str) -> Optional[str]:
            try:
                val = tags.get(key)
                if val is None:
                    return None
                if isinstance(val, list):
                    val = val[0]
                return str(val).strip() or None
            except Exception:
                return None

        # ID3 (mp3)
        if path.suffix.lower() == ".mp3":
            try:
                easy = EasyID3(str(path))
                out["title"] = (easy.get("title") or [None])[0]
                out["artist"] = (easy.get("artist") or [None])[0]
                out["album"] = (easy.get("album") or [None])[0]
                out["year"] = (easy.get("date") or [None])[0]
                out["genre"] = (easy.get("genre") or [None])[0]
                out["track_number"] = (easy.get("tracknumber") or [None])[0]
            except ID3NoHeaderError:
                pass
            try:
                id3 = ID3(str(path))
                out["has_cover"] = any(k.startswith("APIC") for k in id3.keys())
            except ID3NoHeaderError:
                out["has_cover"] = False
        else:
            # Vorbis/FLAC/MP4
            out["title"] = _first("title") or _first("\xa9nam")
            out["artist"] = _first("artist") or _first("\xa9ART")
            out["album"] = _first("album") or _first("\xa9alb")
            out["year"] = _first("date") or _first("\xa9day")
            out["genre"] = _first("genre") or _first("\xa9gen")
            out["track_number"] = _first("tracknumber") or _first("trkn")
            # Cover
            if hasattr(audio, "pictures") and audio.pictures:
                out["has_cover"] = True
            elif "covr" in getattr(audio, "tags", {}) or {}:
                out["has_cover"] = True
    except Exception as exc:
        logger.warning("Tag read failed for %s: %s", path, exc)
    return out


def _classify(tags: dict) -> tuple[str, float, str]:
    """Return (status, confidence, source) based on presence of tags."""
    has_title = bool(tags.get("title"))
    has_artist = bool(tags.get("artist"))
    has_album = bool(tags.get("album"))
    filled = sum([has_title, has_artist, has_album])
    if filled == 3:
        return "identified", 0.95, "tags"
    if filled == 2:
        return "low_confidence", 0.6, "tags"
    if filled == 1:
        return "low_confidence", 0.35, "tags"
    return "unknown", 0.0, "none"


def _iter_audio(folder: Path):
    for p in folder.rglob("*"):
        if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS:
            yield p


async def _acoustid_lookup(path: Path) -> Optional[dict]:
    """Fingerprint via fpcalc and query AcoustID web service."""
    if not ACOUSTID_API_KEY:
        return None
    try:
        import acoustid  # pyacoustid

        def _work():
            try:
                results = list(
                    acoustid.match(ACOUSTID_API_KEY, str(path), parse=True)
                )
            except acoustid.NoBackendError:
                return {"error": "no_fpcalc"}
            except acoustid.FingerprintGenerationError as e:
                return {"error": f"fingerprint_failed: {e}"}
            except acoustid.WebServiceError as e:
                return {"error": f"webservice: {e}"}
            except Exception as e:
                return {"error": f"acoustid: {e}"}
            return {"results": results}

        data = await asyncio.to_thread(_work)
        if "error" in data:
            return {"error": data["error"]}
        results = data.get("results") or []
        if not results:
            return None
        score, rid, title, artist = results[0]
        return {
            "score": float(score or 0.0),
            "recording_id": rid,
            "title": title,
            "artist": artist,
        }
    except Exception as e:
        logger.warning("AcoustID failed for %s: %s", path, e)
        return {"error": str(e)}


async def _compute_fingerprint(path: Path) -> tuple[Optional[str], Optional[float]]:
    """Return (fingerprint_string, duration_seconds) via chromaprint fpcalc."""
    if not shutil.which("fpcalc"):
        return None, None

    def _work():
        try:
            import acoustid
            duration, fp = acoustid.fingerprint_file(str(path))
            if isinstance(fp, bytes):
                fp = fp.decode("ascii", errors="ignore")
            return duration, fp
        except Exception as e:
            logger.warning("fingerprint failed for %s: %s", path, e)
            return None, None

    dur, fp = await asyncio.to_thread(_work)
    return fp, (float(dur) if dur else None)


def _fp_hamming_similarity(fp_a: str, fp_b: str) -> float:
    """Similarity in [0,1] via chromaprint hamming distance on aligned prefix."""
    if not fp_a or not fp_b:
        return 0.0
    try:
        import chromaprint
        arr_a, _ = chromaprint.decode_fingerprint(fp_a.encode("ascii"))
        arr_b, _ = chromaprint.decode_fingerprint(fp_b.encode("ascii"))
        if not arr_a or not arr_b:
            return 0.0
        n = min(len(arr_a), len(arr_b))
        if n == 0:
            return 0.0
        total_bits = n * 32
        diff_bits = 0
        for i in range(n):
            diff_bits += bin(arr_a[i] ^ arr_b[i]).count("1")
        return 1.0 - (diff_bits / total_bits)
    except Exception as e:
        logger.warning("fp compare failed: %s", e)
        return 0.0


async def _scan_folder(folder: Path, use_acoustid: bool):
    global SCAN_STATE
    SCAN_STATE = ScanState(
        running=True,
        folder=str(folder),
        total=0,
        processed=0,
    )
    try:
        files = list(_iter_audio(folder))
        SCAN_STATE.total = len(files)
        # Clear old entries for this folder
        await db.tracks.delete_many({"path": {"$regex": f"^{re.escape(str(folder))}"}})

        for fp in files:
            SCAN_STATE.current_file = fp.name
            tags = _read_tags(fp)
            status, confidence, source = _classify(tags)

            acoustid_id = None
            mbid = None
            error = None
            # Compute fingerprint for every track (used for duplicate detection)
            fp_str, fp_dur = await _compute_fingerprint(fp)
            if use_acoustid and status in ("unknown", "low_confidence"):
                res = await _acoustid_lookup(fp)
                if res and "error" not in res and res.get("score", 0) > 0:
                    if not tags.get("title"):
                        tags["title"] = res.get("title")
                    if not tags.get("artist"):
                        tags["artist"] = res.get("artist")
                    acoustid_id = res.get("recording_id")
                    mbid = res.get("recording_id")
                    confidence = float(res["score"])
                    status = "identified" if confidence >= 0.8 else "low_confidence"
                    source = "acoustid"
                elif res and "error" in res:
                    error = res["error"]

            track = Track(
                path=str(fp),
                filename=fp.name,
                size_bytes=fp.stat().st_size,
                duration=tags.get("duration"),
                title=tags.get("title"),
                artist=tags.get("artist"),
                album=tags.get("album"),
                year=tags.get("year"),
                genre=tags.get("genre"),
                track_number=tags.get("track_number"),
                has_cover=tags.get("has_cover", False),
                status=status,
                source=source,
                confidence=confidence,
                acoustid_id=acoustid_id,
                musicbrainz_recording_id=mbid,
                error=error,
                fingerprint=fp_str,
                fp_duration=fp_dur,
            )
            doc = track.model_dump()
            await db.tracks.insert_one(doc)

            SCAN_STATE.processed += 1
            if status == "identified":
                SCAN_STATE.identified += 1
            elif status in ("unknown", "low_confidence"):
                SCAN_STATE.unknown += 1
            if error:
                SCAN_STATE.errors += 1

        SCAN_STATE.current_file = None
        SCAN_STATE.finished_at = datetime.now(timezone.utc).isoformat()
    except Exception as e:
        logger.exception("Scan failed: %s", e)
        SCAN_STATE.errors += 1
    finally:
        SCAN_STATE.running = False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@api_router.get("/")
async def root():
    return {"service": "local-music-indexer", "ok": True}


@api_router.get("/config", response_model=ConfigResponse)
async def get_config():
    return ConfigResponse(
        library_root=DEFAULT_LIBRARY_ROOT,
        sample_root=SAMPLE_MUSIC_ROOT,
        acoustid_configured=bool(ACOUSTID_API_KEY),
        llm_configured=bool(EMERGENT_LLM_KEY),
        fpcalc_available=shutil.which("fpcalc") is not None,
    )


@api_router.post("/scan")
async def start_scan(req: ScanRequest):
    if SCAN_STATE.running:
        raise HTTPException(409, "A scan is already running")
    folder = Path(req.folder or DEFAULT_LIBRARY_ROOT).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, f"Folder not found: {folder}")
    asyncio.create_task(_scan_folder(folder, req.use_acoustid))
    # Give it a moment to update state
    await asyncio.sleep(0.05)
    return {"started": True, "folder": str(folder)}


@api_router.get("/scan/status", response_model=ScanState)
async def scan_status():
    return SCAN_STATE


@api_router.get("/tracks", response_model=List[Track])
async def list_tracks(status: Optional[str] = None, limit: int = 500):
    q: dict = {}
    if status and status != "all":
        q["status"] = status
    docs = await db.tracks.find(q, {"_id": 0}).limit(limit).to_list(limit)
    return [Track(**d) for d in docs]


@api_router.get("/stats")
async def stats():
    total = await db.tracks.count_documents({})
    identified = await db.tracks.count_documents({"status": "identified"})
    unknown = await db.tracks.count_documents({"status": "unknown"})
    low = await db.tracks.count_documents({"status": "low_confidence"})
    with_cover = await db.tracks.count_documents({"has_cover": True})
    return {
        "total": total,
        "identified": identified,
        "unknown": unknown,
        "low_confidence": low,
        "with_cover": with_cover,
        "identified_pct": (identified / total * 100) if total else 0.0,
    }


@api_router.post("/identify")
async def identify(req: IdentifyRequest):
    if not ACOUSTID_API_KEY:
        raise HTTPException(400, "AcoustID API key not configured")
    q: dict = {}
    if req.track_ids:
        q["id"] = {"$in": req.track_ids}
    else:
        q["status"] = {"$in": ["unknown", "low_confidence"]}
    docs = await db.tracks.find(q, {"_id": 0}).to_list(500)
    updated = 0
    errors = 0
    for d in docs:
        track = Track(**d)
        res = await _acoustid_lookup(Path(track.path))
        if not res or "error" in res:
            errors += 1
            await db.tracks.update_one(
                {"id": track.id},
                {"$set": {"error": (res or {}).get("error", "no_match")}},
            )
            continue
        title = res.get("title") or track.title
        artist = res.get("artist") or track.artist
        conf = float(res.get("score") or 0.0)
        new_status = "identified" if conf >= 0.8 else "low_confidence"
        await db.tracks.update_one(
            {"id": track.id},
            {
                "$set": {
                    "title": title,
                    "artist": artist,
                    "acoustid_id": res.get("recording_id"),
                    "musicbrainz_recording_id": res.get("recording_id"),
                    "confidence": conf,
                    "status": new_status,
                    "source": "acoustid",
                    "error": None,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
        )
        updated += 1
    return {"updated": updated, "errors": errors, "total_checked": len(docs)}


@api_router.patch("/tracks/{track_id}")
async def update_track(track_id: str, body: UpdateTrackRequest):
    doc = await db.tracks.find_one({"id": track_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "track not found")

    update = {k: v for k, v in body.model_dump().items() if v is not None and k != "apply_to_file"}
    if update:
        update["source"] = "manual"
        update["updated_at"] = datetime.now(timezone.utc).isoformat()
        # Recompute status
        merged = {**doc, **update}
        status, conf, _ = _classify(merged)
        update["status"] = status
        update["confidence"] = max(conf, 0.9 if body.apply_to_file else conf)
        await db.tracks.update_one({"id": track_id}, {"$set": update})

    if body.apply_to_file:
        try:
            _write_tags(Path(doc["path"]), {**doc, **update})
        except Exception as e:
            raise HTTPException(500, f"Failed to write tags: {e}") from e

    new_doc = await db.tracks.find_one({"id": track_id}, {"_id": 0})
    return Track(**new_doc)


def _write_tags(path: Path, data: dict):
    """Apply title/artist/album/year/genre back to the audio file."""
    if path.suffix.lower() == ".mp3":
        try:
            audio = EasyID3(str(path))
        except ID3NoHeaderError:
            audio = EasyID3()
        for tag_key, dict_key in (
            ("title", "title"),
            ("artist", "artist"),
            ("album", "album"),
            ("date", "year"),
            ("genre", "genre"),
            ("tracknumber", "track_number"),
        ):
            val = data.get(dict_key)
            if val:
                audio[tag_key] = str(val)
        audio.save(str(path))
    else:
        audio = MutagenFile(str(path), easy=True)
        if audio is None:
            raise RuntimeError("Unsupported audio format for writing")
        for tag_key, dict_key in (
            ("title", "title"),
            ("artist", "artist"),
            ("album", "album"),
            ("date", "year"),
            ("genre", "genre"),
            ("tracknumber", "track_number"),
        ):
            val = data.get(dict_key)
            if val:
                audio[tag_key] = str(val)
        audio.save()


async def _generate_cover_bytes(prompt: str, model: str) -> bytes:
    """Return raw image bytes generated by the chosen model."""
    if not EMERGENT_LLM_KEY:
        raise HTTPException(400, "EMERGENT_LLM_KEY not configured")

    if model == "nano-banana":
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"cover-{uuid.uuid4()}",
            system_message="You generate square album cover artwork based on user briefs.",
        )
        chat.with_model("gemini", "gemini-3.1-flash-image-preview").with_params(
            modalities=["image", "text"]
        )
        _, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
        if not images:
            raise HTTPException(502, "Model returned no image")
        return base64.b64decode(images[0]["data"])

    # gpt-image-1
    from emergentintegrations.llm.openai.image_generation import OpenAIImageGeneration

    gen = OpenAIImageGeneration(api_key=EMERGENT_LLM_KEY)
    imgs = await gen.generate_images(prompt=prompt, model="gpt-image-1", number_of_images=1)
    if not imgs:
        raise HTTPException(502, "Model returned no image")
    return imgs[0]


@api_router.post("/cover-art")
async def cover_art(req: CoverArtRequest):
    doc = await db.tracks.find_one({"id": req.track_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "track not found")

    artist = doc.get("artist") or "Unknown Artist"
    title = doc.get("title") or doc.get("filename") or "Untitled"
    album = doc.get("album") or title
    genre = doc.get("genre") or ""
    hint = req.style_hint or "modern, high-contrast, editorial vinyl sleeve"

    prompt = (
        f"Square album cover artwork for '{album}' by {artist}. "
        f"Track: {title}. Genre: {genre}. Style: {hint}. "
        f"No text, no logos, no watermarks. Rich colors, high resolution, 1:1."
    )

    try:
        img_bytes = await _generate_cover_bytes(prompt, req.model)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Image generation failed: {e}") from e

    fname = f"{req.track_id}_{req.model}.png"
    out_path = COVER_OUT_DIR / fname
    out_path.write_bytes(img_bytes)
    b64 = base64.b64encode(img_bytes).decode()
    data_url = f"data:image/png;base64,{b64}"

    update = {
        "cover_data_url": data_url,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if req.embed_in_file:
        try:
            _embed_cover(Path(doc["path"]), img_bytes)
            update["has_cover"] = True
        except Exception as e:
            raise HTTPException(500, f"Failed to embed cover: {e}") from e

    await db.tracks.update_one({"id": req.track_id}, {"$set": update})
    return {"track_id": req.track_id, "model": req.model, "cover_data_url": data_url, "prompt": prompt}


def _embed_cover(path: Path, img_bytes: bytes):
    if path.suffix.lower() == ".mp3":
        try:
            audio = ID3(str(path))
        except ID3NoHeaderError:
            audio = ID3()
        # Remove old APIC frames
        audio.delall("APIC")
        audio.add(
            APIC(
                encoding=3,
                mime="image/png",
                type=3,
                desc="Cover",
                data=img_bytes,
            )
        )
        audio.save(str(path))
    else:
        # Other formats: skip gracefully
        raise RuntimeError("Embedding cover only supported for .mp3 in this build")


def _safe_name(s: str) -> str:
    s = (s or "").strip() or "Unknown"
    s = re.sub(r"[^\w\-\. ()&,]", "_", s)
    return s[:150]


@api_router.post("/organize")
async def organize(req: OrganizeRequest):
    q: dict = {}
    if req.track_ids:
        q["id"] = {"$in": req.track_ids}
    else:
        q["status"] = {"$in": ["identified", "low_confidence"]}
    docs = await db.tracks.find(q, {"_id": 0}).to_list(1000)
    dest_root = Path(req.destination or (Path(DEFAULT_LIBRARY_ROOT) / "_organized")).resolve()
    dest_root.mkdir(parents=True, exist_ok=True)
    moved = 0
    plan = []
    for d in docs:
        artist = _safe_name(d.get("artist"))
        album = _safe_name(d.get("album") or "Singles")
        title = _safe_name(d.get("title") or Path(d["path"]).stem)
        ext = Path(d["path"]).suffix.lower()
        tno = d.get("track_number")
        prefix = ""
        if tno:
            m = re.match(r"^(\d+)", str(tno))
            if m:
                prefix = f"{int(m.group(1)):02d} - "
        target_dir = dest_root / artist / album
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / f"{prefix}{title}{ext}"
        src = Path(d["path"])
        if not src.exists():
            continue
        if str(src.resolve()) == str(target_path.resolve()):
            continue
        try:
            if req.mode == "move":
                shutil.move(str(src), str(target_path))
                await db.tracks.update_one({"id": d["id"]}, {"$set": {"path": str(target_path)}})
            else:
                shutil.copy2(str(src), str(target_path))
            plan.append({"from": str(src), "to": str(target_path)})
            moved += 1
        except Exception as e:
            logger.warning("Organize failed for %s: %s", src, e)
    return {"count": moved, "destination": str(dest_root), "plan": plan[:100]}


@api_router.get("/audio/{track_id}")
async def stream_audio(track_id: str):
    doc = await db.tracks.find_one({"id": track_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "not found")
    p = Path(doc["path"])
    if not p.exists():
        raise HTTPException(404, "file missing")
    return FileResponse(str(p), media_type="audio/mpeg", filename=p.name)


# ---------------------------------------------------------------------------
# Duplicate detection
# ---------------------------------------------------------------------------
class DuplicateScanRequest(BaseModel):
    threshold: float = 0.92  # similarity threshold (0..1)


class DuplicateDeleteRequest(BaseModel):
    track_ids: List[str]
    delete_from_disk: bool = False


@api_router.post("/duplicates/scan")
async def scan_duplicates(req: DuplicateScanRequest):
    """Group tracks whose chromaprint fingerprints are near-identical.
    Also computes fingerprints on-the-fly for tracks that don't have one yet.
    """
    docs = await db.tracks.find({}, {"_id": 0}).to_list(5000)
    # Fill missing fingerprints
    missing = [d for d in docs if not d.get("fingerprint")]
    for d in missing:
        p = Path(d["path"])
        if not p.exists():
            continue
        fp, dur = await _compute_fingerprint(p)
        if fp:
            await db.tracks.update_one(
                {"id": d["id"]},
                {"$set": {"fingerprint": fp, "fp_duration": dur}},
            )
            d["fingerprint"] = fp
            d["fp_duration"] = dur

    valid = [d for d in docs if d.get("fingerprint")]
    # Union-find clustering
    parent = list(range(len(valid)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    threshold = max(0.5, min(1.0, req.threshold))
    for i in range(len(valid)):
        for j in range(i + 1, len(valid)):
            # Quick duration prefilter (±10s)
            da = valid[i].get("fp_duration") or valid[i].get("duration") or 0
            db_ = valid[j].get("fp_duration") or valid[j].get("duration") or 0
            if da and db_ and abs(da - db_) > 10:
                continue
            sim = _fp_hamming_similarity(valid[i]["fingerprint"], valid[j]["fingerprint"])
            if sim >= threshold:
                union(i, j)

    groups: dict[int, list[dict]] = {}
    for idx, d in enumerate(valid):
        root = find(idx)
        groups.setdefault(root, []).append(d)

    dup_groups = []
    for root, items in groups.items():
        if len(items) < 2:
            continue
        # Pick "keeper" heuristic: highest confidence, then largest file
        items_sorted = sorted(
            items,
            key=lambda x: (x.get("confidence") or 0.0, x.get("size_bytes") or 0),
            reverse=True,
        )
        # Compute pairwise similarity against the keeper for display
        keeper = items_sorted[0]
        entries = []
        for it in items_sorted:
            sim = 1.0 if it["id"] == keeper["id"] else _fp_hamming_similarity(
                keeper["fingerprint"], it["fingerprint"]
            )
            entries.append({
                "id": it["id"],
                "path": it["path"],
                "filename": it["filename"],
                "title": it.get("title"),
                "artist": it.get("artist"),
                "album": it.get("album"),
                "duration": it.get("duration"),
                "size_bytes": it.get("size_bytes"),
                "confidence": it.get("confidence") or 0.0,
                "status": it.get("status"),
                "similarity": round(sim, 4),
                "is_keeper": it["id"] == keeper["id"],
            })
        dup_groups.append({
            "group_id": f"grp_{root}",
            "keeper_id": keeper["id"],
            "count": len(items),
            "tracks": entries,
        })

    dup_groups.sort(key=lambda g: g["count"], reverse=True)
    return {
        "threshold": threshold,
        "total_tracks_analyzed": len(valid),
        "tracks_missing_fingerprint": len(docs) - len(valid),
        "group_count": len(dup_groups),
        "duplicate_file_count": sum(g["count"] - 1 for g in dup_groups),
        "groups": dup_groups,
    }


@api_router.post("/duplicates/delete")
async def delete_duplicates(req: DuplicateDeleteRequest):
    """Delete selected duplicate tracks from DB and optionally from disk."""
    docs = await db.tracks.find(
        {"id": {"$in": req.track_ids}}, {"_id": 0}
    ).to_list(1000)
    disk_removed = 0
    disk_errors = []
    if req.delete_from_disk:
        for d in docs:
            p = Path(d["path"])
            try:
                if p.exists():
                    p.unlink()
                    disk_removed += 1
            except Exception as e:
                disk_errors.append({"path": str(p), "error": str(e)})
    res = await db.tracks.delete_many({"id": {"$in": req.track_ids}})
    return {
        "removed_from_db": res.deleted_count,
        "removed_from_disk": disk_removed,
        "disk_errors": disk_errors,
    }


# ---------------------------------------------------------------------------
# (audio route already registered above)
# ---------------------------------------------------------------------------


@api_router.post("/seed-sample")
async def seed_sample():
    """Create a small synthetic sample library for demo/testing."""
    root = Path(SAMPLE_MUSIC_ROOT)
    root.mkdir(parents=True, exist_ok=True)

    samples = [
        {
            "name": "01 - midnight_drive.mp3",
            "title": "Midnight Drive",
            "artist": "Neon Circuit",
            "album": "Analog Dreams",
            "genre": "Synthwave",
            "year": "2024",
            "freq": 440,
        },
        {
            "name": "02 - crystal_static.mp3",
            "title": "Crystal Static",
            "artist": "Neon Circuit",
            "album": "Analog Dreams",
            "genre": "Synthwave",
            "year": "2024",
            "freq": 523,
        },
        {
            "name": "unknown_track_a.mp3",  # intentionally no tags
            "title": None,
            "artist": None,
            "album": None,
            "genre": None,
            "year": None,
            "freq": 660,
        },
        {
            "name": "unknown_track_b.mp3",
            "title": None,
            "artist": None,
            "album": None,
            "genre": None,
            "year": None,
            "freq": 330,
        },
        {
            "name": "partial_tagged.mp3",
            "title": "Ghost In The Signal",
            "artist": None,
            "album": None,
            "genre": None,
            "year": None,
            "freq": 392,
        },
    ]

    created = []
    for s in samples:
        target = root / s["name"]
        if not target.exists():
            proc = subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-f",
                    "lavfi",
                    "-i",
                    f"sine=frequency={s['freq']}:duration=8",
                    "-ac",
                    "1",
                    "-b:a",
                    "96k",
                    str(target),
                ],
                capture_output=True,
                timeout=30,
            )
            if proc.returncode != 0:
                logger.error("ffmpeg failed: %s", proc.stderr.decode()[:400])
                continue

        # Apply tags where provided
        if any(s.get(k) for k in ("title", "artist", "album", "genre", "year")):
            try:
                easy = EasyID3(str(target))
            except ID3NoHeaderError:
                easy = EasyID3()
            for tag, key in (
                ("title", "title"),
                ("artist", "artist"),
                ("album", "album"),
                ("genre", "genre"),
                ("date", "year"),
            ):
                if s.get(key):
                    easy[tag] = s[key]
            easy.save(str(target))
        created.append(s["name"])
    return {"created": created, "root": str(root), "count": len(created)}


@api_router.post("/seed-duplicates")
async def seed_duplicates():
    """Create obvious duplicates by copying existing sample files with new names."""
    root = Path(SAMPLE_MUSIC_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    pairs = [
        ("01 - midnight_drive.mp3", "midnight_drive_COPY.mp3"),
        ("02 - crystal_static.mp3", "crystal_static (1).mp3"),
    ]
    created = []
    for src_name, dst_name in pairs:
        src = root / src_name
        dst = root / dst_name
        if src.exists() and not dst.exists():
            shutil.copy2(str(src), str(dst))
            created.append(dst_name)
    return {"created": created, "count": len(created)}


# ---------------------------------------------------------------------------
# Wire-up
# ---------------------------------------------------------------------------
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def _shutdown():
    client.close()
