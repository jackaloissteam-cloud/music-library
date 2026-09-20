import { useEffect, useState } from "react";
import { http, API } from "@/App";
import { IDS_PL } from "@/testIds";
import { toast } from "sonner";

export default function PlaylistsPanel({ tracks, onPlay }) {
  const [playlists, setPlaylists] = useState([]);
  const [prompt, setPrompt] = useState("late-night synthwave drive, melancholic and dreamy");
  const [seed, setSeed] = useState("");
  const [count, setCount] = useState(10);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [expandedTracks, setExpandedTracks] = useState({});

  const load = async () => {
    try { const r = await http.get("/playlists"); setPlaylists(r.data); }
    catch { toast.error("Failed to load playlists"); }
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const r = await http.post("/playlists/generate", {
        seed_track_id: seed || null,
        prompt: prompt || null,
        count: Math.max(2, Math.min(50, count)),
        name: name || null,
      });
      toast.success(`Generated: "${r.data.name}" · ${r.data.track_ids.length} tracks`);
      await load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Generation failed");
    } finally { setBusy(false); }
  };

  const openPlaylist = async (id) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!expandedTracks[id]) {
      const r = await http.get(`/playlists/${id}`);
      setExpandedTracks({ ...expandedTracks, [id]: r.data.tracks });
    }
  };

  const del = async (id) => {
    if (!confirm("Delete this playlist?")) return;
    await http.delete(`/playlists/${id}`);
    toast.success("Playlist deleted");
    load();
  };

  const playAll = async (pl) => {
    let list = expandedTracks[pl.id];
    if (!list) {
      const r = await http.get(`/playlists/${pl.id}`);
      list = r.data.tracks;
      setExpandedTracks({ ...expandedTracks, [pl.id]: list });
    }
    onPlay(list, 0, pl.name);
  };

  return (
    <div className="reveal">
      {/* Generator */}
      <div className="p-5 border border-[#292524] bg-[#0C0C0C] mb-0 grid md:grid-cols-4 gap-3">
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-widest text-[#78716C]">MOOD / BRIEF</label>
          <input
            data-testid={IDS_PL.promptInput}
            value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. melancholic late-night drive"
            className="w-full mt-1 bg-black border border-[#292524] text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#FF3300]"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-[#78716C]">SEED TRACK (opt)</label>
          <select
            data-testid={IDS_PL.seedSelect}
            value={seed} onChange={(e) => setSeed(e.target.value)}
            className="w-full mt-1 bg-black border border-[#292524] text-white px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#FF3300]"
          >
            <option value="">— none —</option>
            {tracks.filter(t => t.status === "identified").map(t => (
              <option key={t.id} value={t.id}>{t.artist} — {t.title}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#78716C]">COUNT</label>
            <input
              data-testid={IDS_PL.countInput}
              type="number" min="2" max="50" value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 10)}
              className="w-full mt-1 bg-black border border-[#292524] text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#FF3300]"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[#78716C]">NAME</label>
            <input
              data-testid={IDS_PL.nameInput}
              value={name} onChange={(e) => setName(e.target.value)}
              placeholder="auto"
              className="w-full mt-1 bg-black border border-[#292524] text-white px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#FF3300]"
            />
          </div>
        </div>
        <div className="md:col-span-4 flex justify-end">
          <button
            data-testid={IDS_PL.generateBtn}
            onClick={generate} disabled={busy}
            className="bg-[#FF3300] text-black hover:bg-[#E62E00] border border-[#FF3300] px-6 py-2 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30"
          >
            {busy ? "CURATING..." : "◈ GENERATE PLAYLIST"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="border border-t-0 border-[#292524] bg-black">
        {playlists.length === 0 && (
          <div className="p-12 text-center text-[11px] uppercase tracking-widest text-[#78716C]">
            &gt; NO PLAYLISTS · GENERATE ONE ABOVE
          </div>
        )}
        {playlists.map((pl) => (
          <div key={pl.id} className="border-b border-[#292524]" data-testid={IDS_PL.playlistCard(pl.id)}>
            <div className="flex items-center justify-between px-4 py-3 hover:bg-[#1A1A1A] cursor-pointer" onClick={() => openPlaylist(pl.id)}>
              <div className="min-w-0 flex-1">
                <div className="text-white font-display font-medium truncate">{pl.name}</div>
                <div className="text-[10px] text-[#78716C] truncate">
                  {pl.track_ids.length} tracks · {pl.description || pl.prompt || "—"}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0 ml-4" onClick={(e) => e.stopPropagation()}>
                <button data-testid={IDS_PL.playBtn(pl.id)} onClick={() => playAll(pl)}
                  className="text-[10px] uppercase tracking-widest text-[#00FF66] hover:text-black hover:bg-[#00FF66] border border-[#00FF66]/40 px-2 py-1 transition-colors">▶ PLAY</button>
                <a data-testid={IDS_PL.exportBtn(pl.id)} href={`${API}/playlists/${pl.id}/export.m3u`}
                  className="text-[10px] uppercase tracking-widest text-white hover:text-black hover:bg-white border border-white/40 px-2 py-1 transition-colors">↓ M3U</a>
                <button data-testid={IDS_PL.deleteBtn(pl.id)} onClick={() => del(pl.id)}
                  className="text-[10px] uppercase tracking-widest text-[#FF0033] hover:text-black hover:bg-[#FF0033] border border-[#FF0033]/40 px-2 py-1 transition-colors">✕</button>
              </div>
            </div>
            {expanded === pl.id && (
              <div className="bg-[#0C0C0C] border-t border-[#292524] px-4 py-2">
                {(expandedTracks[pl.id] || []).map((t, i) => (
                  <div key={t.id} className="flex justify-between items-center py-1.5 border-b border-[#292524] last:border-0 text-xs">
                    <div className="flex gap-3 min-w-0">
                      <span className="text-[#78716C] font-mono w-6">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-white truncate max-w-[300px]">{t.title || t.filename}</span>
                      <span className="text-[#A8A29E] truncate max-w-[200px]">{t.artist}</span>
                    </div>
                    <button onClick={() => onPlay(expandedTracks[pl.id], i, pl.name)}
                      className="text-[#00FF66] hover:underline">▶</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
