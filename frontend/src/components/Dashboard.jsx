import { useEffect, useMemo, useRef, useState } from "react";
import { http } from "@/App";
import { IDS, IDS_DUP } from "@/testIds";
import { toast } from "sonner";
import TrackTable from "@/components/TrackTable";
import ScanControls from "@/components/ScanControls";
import StatsRow from "@/components/StatsRow";
import FixModal from "@/components/FixModal";
import CoverModal from "@/components/CoverModal";
import DuplicatesPanel from "@/components/DuplicatesPanel";

export default function Dashboard() {
  const [config, setConfig] = useState(null);
  const [scanState, setScanState] = useState({ running: false });
  const [tracks, setTracks] = useState([]);
  const [stats, setStats] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [openFix, setOpenFix] = useState(null);
  const [openCover, setOpenCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState("library"); // "library" | "duplicates"
  const pollRef = useRef(null);

  const loadAll = async (statusOverride) => {
    setLoading(true);
    try {
      const q = (statusOverride ?? filter) === "all" ? "" : `?status=${statusOverride ?? filter}`;
      const [t, s] = await Promise.all([
        http.get(`/tracks${q}`),
        http.get("/stats"),
      ]);
      setTracks(t.data);
      setStats(s.data);
    } catch (e) {
      toast.error("Failed to load tracks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    http.get("/config").then((r) => setConfig(r.data)).catch(() => {});
    loadAll("all");
  }, []);

  useEffect(() => { loadAll(filter); }, [filter]);

  const pollScan = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await http.get("/scan/status");
        setScanState(r.data);
        if (!r.data.running) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          toast.success(`Scan complete • ${r.data.processed} files`);
          loadAll(filter);
        }
      } catch (_) {
        // ignore poll errors
      }
    }, 800);
  };

  const startScan = async (folder, useAcoustid) => {
    try {
      setBusy(true);
      await http.post("/scan", { folder, use_acoustid: useAcoustid });
      toast.message("Scan started", { description: folder });
      pollScan();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Scan failed to start");
    } finally {
      setBusy(false);
    }
  };

  const seedSamples = async () => {
    try {
      setBusy(true);
      const r = await http.post("/seed-sample");
      toast.success(`Seeded ${r.data.count} samples`);
    } catch {
      toast.error("Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const identifyAll = async () => {
    try {
      setBusy(true);
      const r = await http.post("/identify", {});
      toast.success(`AcoustID: ${r.data.updated} updated · ${r.data.errors} errors`);
      loadAll(filter);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Identify failed");
    } finally {
      setBusy(false);
    }
  };

  const identifyOne = async (trackId) => {
    try {
      setBusy(true);
      const r = await http.post("/identify", { track_ids: [trackId] });
      if (r.data.updated) toast.success("Track identified");
      else toast.warning("No AcoustID match");
      loadAll(filter);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Identify failed");
    } finally {
      setBusy(false);
    }
  };

  const saveTrack = async (id, patch, applyToFile) => {
    try {
      setBusy(true);
      const r = await http.patch(`/tracks/${id}`, { ...patch, apply_to_file: applyToFile });
      toast.success(applyToFile ? "Saved + wrote tags to file" : "Saved");
      setTracks((prev) => prev.map((t) => (t.id === id ? r.data : t)));
      http.get("/stats").then((s) => setStats(s.data));
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const generateCover = async (id, model, styleHint, embed) => {
    try {
      setBusy(true);
      toast.message(`Generating cover via ${model}...`, { description: "This may take up to 60s" });
      const r = await http.post("/cover-art", {
        track_id: id,
        model,
        style_hint: styleHint || null,
        embed_in_file: embed,
      });
      toast.success("Cover generated");
      setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, cover_data_url: r.data.cover_data_url, has_cover: embed ? true : t.has_cover } : t)));
      return r.data;
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Cover generation failed");
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const organize = async () => {
    if (!confirm("Copy identified tracks into /Artist/Album/Track.mp3 structure?")) return;
    try {
      setBusy(true);
      const r = await http.post("/organize", { mode: "copy" });
      toast.success(`Organized ${r.data.count} files → ${r.data.destination}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Organize failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white grid-bg">
      <div className="w-full max-w-[1600px] mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4 py-4 border-b border-[#292524] mb-8 reveal">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#78716C] font-mono">/emergent · module 03</div>
            <h1 data-testid={IDS.brand} className="font-display text-4xl md:text-5xl font-black tracking-tighter text-white mt-1">
              LOCAL·MUSIC<span className="text-[#FF3300]">.</span>INDEXER
            </h1>
            <div className="text-xs text-[#A8A29E] mt-2 flex gap-4 flex-wrap font-mono">
              <span>fpcalc:<span className={config?.fpcalc_available ? "text-[#00FF66]" : "text-[#FF0033]"}> {config?.fpcalc_available ? "READY" : "MISSING"}</span></span>
              <span>acoustid:<span className={config?.acoustid_configured ? "text-[#00FF66]" : "text-[#FF0033]"}> {config?.acoustid_configured ? "CONFIGURED" : "NONE"}</span></span>
              <span>llm:<span className={config?.llm_configured ? "text-[#00FF66]" : "text-[#FF0033]"}> {config?.llm_configured ? "ONLINE" : "OFFLINE"}</span></span>
            </div>
          </div>
          <ScanControls
            defaultFolder={config?.sample_root || "/app/sample_music"}
            libraryRoot={config?.library_root}
            onScan={startScan}
            onSeed={seedSamples}
            busy={busy || scanState.running}
          />
        </header>

        {/* Scan status */}
        {scanState.running && (
          <div className="mb-6 border border-[#292524] bg-[#0C0C0C] p-4 reveal">
            <div className="flex justify-between text-xs uppercase tracking-widest text-[#A8A29E] mb-2">
              <span>SCAN IN PROGRESS <span className="cursor-blink" /></span>
              <span className="text-[#00FF66]">{scanState.processed}/{scanState.total}</span>
            </div>
            <div className="scanline-bar mb-2" />
            <div className="text-[11px] text-[#78716C] font-mono truncate">{scanState.current_file || "..."}</div>
          </div>
        )}

        {/* Stats */}
        <StatsRow stats={stats} />

        {/* Tab switcher */}
        <div className="flex items-center gap-0 border border-[#292524] bg-[#0C0C0C] mb-0 border-b-0">
          <button
            data-testid={IDS_DUP.tabLibrary}
            onClick={() => setView("library")}
            className={`px-6 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors border-r border-[#292524] ${
              view === "library"
                ? "bg-[#FF3300] text-black font-bold"
                : "text-[#A8A29E] hover:text-white"
            }`}
          >
            ▤ LIBRARY
          </button>
          <button
            data-testid={IDS_DUP.tabDuplicates}
            onClick={() => setView("duplicates")}
            className={`px-6 py-3 font-mono text-[11px] uppercase tracking-widest transition-colors border-r border-[#292524] ${
              view === "duplicates"
                ? "bg-[#FF3300] text-black font-bold"
                : "text-[#A8A29E] hover:text-white"
            }`}
          >
            ⧉ DUPLICATE FINDER
          </button>
          <div className="ml-auto pr-3">
            <button
              data-testid={IDS_DUP.seedDupBtn}
              onClick={async () => {
                try {
                  const r = await http.post("/seed-duplicates");
                  toast.success(`Seeded ${r.data.count} duplicate copies · re-scan to pick them up`);
                } catch (e) {
                  toast.error("Seed duplicates failed");
                }
              }}
              className="text-[10px] uppercase tracking-widest text-[#78716C] hover:text-white transition-colors px-3 py-2"
            >
              + SEED DUPES
            </button>
          </div>
        </div>

        {view === "library" ? (
          <>
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 p-4 border border-[#292524] bg-[#0C0C0C] mb-0">
              <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-[#A8A29E]">
                <span>FILTER</span>
                <select
                  data-testid={IDS.statusFilter}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="bg-black text-white border border-[#292524] rounded-none px-3 py-2 font-mono text-xs uppercase focus:outline-none focus:border-[#FF3300]"
                >
                  <option value="all">ALL</option>
                  <option value="identified">IDENTIFIED</option>
                  <option value="low_confidence">LOW CONFIDENCE</option>
                  <option value="unknown">UNKNOWN</option>
                </select>
                <button
                  data-testid={IDS.refreshBtn}
                  onClick={() => loadAll(filter)}
                  className="bg-transparent text-[#A8A29E] hover:text-white border border-[#292524] hover:border-[#A8A29E] rounded-none px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors"
                >
                  ↻ REFRESH
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  data-testid={IDS.identifyAllBtn}
                  onClick={identifyAll}
                  disabled={busy || !config?.acoustid_configured}
                  className="bg-transparent text-white border border-[#FF3300] hover:bg-[#FF3300] hover:text-black rounded-none px-4 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  ⌕ AUTO-IDENTIFY UNKNOWNS
                </button>
                <button
                  data-testid={IDS.organizeBtn}
                  onClick={organize}
                  disabled={busy}
                  className="bg-[#FF3300] text-black border border-[#FF3300] hover:bg-[#E62E00] rounded-none px-4 py-2 font-mono text-[11px] uppercase tracking-wider font-bold transition-colors disabled:opacity-30"
                >
                  ▶ ORGANIZE LIBRARY
                </button>
              </div>
            </div>

            {/* Table */}
            <TrackTable
              tracks={tracks}
              loading={loading}
              onFix={(t) => setOpenFix(t)}
              onCover={(t) => setOpenCover(t)}
            />
          </>
        ) : (
          <DuplicatesPanel onBack={() => setView("library")} onChanged={() => loadAll(filter)} />
        )}

        {/* Footer */}
        <footer className="mt-10 py-6 border-t border-[#292524] text-[10px] uppercase tracking-[0.3em] text-[#78716C] flex justify-between">
          <span>library_root: <span className="text-[#A8A29E]">{config?.library_root}</span></span>
          <span>emergent · local-music-indexer</span>
        </footer>
      </div>

      {openFix && (
        <FixModal
          track={openFix}
          onClose={() => setOpenFix(null)}
          onSave={saveTrack}
          onIdentify={identifyOne}
          acoustidReady={config?.acoustid_configured}
        />
      )}
      {openCover && (
        <CoverModal
          track={openCover}
          onClose={() => setOpenCover(null)}
          onGenerate={generateCover}
        />
      )}
    </div>
  );
}
