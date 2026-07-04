import { useState } from "react";
import { http } from "@/App";
import { toast } from "sonner";
import { IDS_DUP } from "@/testIds";

export default function DuplicatesPanel({ onBack, onChanged }) {
  const [threshold, setThreshold] = useState(0.95);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [selected, setSelected] = useState({});
  const [deleteFromDisk, setDeleteFromDisk] = useState(false);
  const [busy, setBusy] = useState(false);

  const runScan = async () => {
    setScanning(true);
    setResult(null);
    setSelected({});
    try {
      const r = await http.post("/duplicates/scan", { threshold });
      setResult(r.data);
      // Auto-preselect all non-keepers
      const pre = {};
      r.data.groups.forEach((g) => {
        g.tracks.forEach((t) => {
          if (!t.is_keeper) pre[t.id] = true;
        });
      });
      setSelected(pre);
      toast.success(`Found ${r.data.group_count} duplicate groups · ${r.data.duplicate_file_count} extra files`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Duplicate scan failed");
    } finally {
      setScanning(false);
    }
  };

  const doDelete = async () => {
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length) {
      toast.warning("No tracks selected");
      return;
    }
    const msg = deleteFromDisk
      ? `PERMANENTLY DELETE ${ids.length} files from disk?`
      : `Remove ${ids.length} tracks from the index (files stay on disk)?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const r = await http.post("/duplicates/delete", {
        track_ids: ids,
        delete_from_disk: deleteFromDisk,
      });
      toast.success(`Removed ${r.data.removed_from_db} from index · ${r.data.removed_from_disk} from disk`);
      onChanged?.();
      await runScan();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const selectedCount = Object.values(selected).filter(Boolean).length;

  return (
    <div className="reveal">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border border-[#292524] bg-[#0C0C0C] mb-0">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={onBack}
            data-testid={IDS_DUP.backBtn}
            className="text-[10px] uppercase tracking-widest text-[#A8A29E] hover:text-white border border-[#292524] hover:border-[#A8A29E] px-3 py-2 transition-colors"
          >
            ← LIBRARY
          </button>
          <span className="text-[10px] uppercase tracking-[0.3em] text-[#78716C]">SIMILARITY</span>
          <input
            data-testid={IDS_DUP.thresholdInput}
            type="range"
            min="0.7"
            max="1"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="accent-[#FF3300] w-40"
          />
          <span className="text-xs font-mono text-[#00FF66] w-14">{(threshold * 100).toFixed(0)}%</span>
          <button
            data-testid={IDS_DUP.runBtn}
            onClick={runScan}
            disabled={scanning}
            className="bg-[#FF3300] text-black hover:bg-[#E62E00] border border-[#FF3300] rounded-none px-4 py-2 font-mono text-[11px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30"
          >
            {scanning ? "SCANNING..." : "▶ FIND DUPLICATES"}
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-[#A8A29E] cursor-pointer select-none">
            <input
              data-testid={IDS_DUP.diskToggle}
              type="checkbox"
              checked={deleteFromDisk}
              onChange={(e) => setDeleteFromDisk(e.target.checked)}
              className="accent-[#FF0033]"
            />
            <span className={deleteFromDisk ? "text-[#FF0033]" : ""}>ALSO DELETE FROM DISK</span>
          </label>
          <button
            data-testid={IDS_DUP.deleteBtn}
            disabled={!selectedCount || busy}
            onClick={doDelete}
            className={`border rounded-none px-4 py-2 font-mono text-[11px] uppercase tracking-widest transition-colors disabled:opacity-30 ${
              deleteFromDisk
                ? "border-[#FF0033] text-[#FF0033] hover:bg-[#FF0033] hover:text-black"
                : "border-[#FFD700] text-[#FFD700] hover:bg-[#FFD700] hover:text-black"
            }`}
          >
            ✕ DELETE {selectedCount || ""}
          </button>
        </div>
      </div>

      {scanning && (
        <div className="border border-t-0 border-[#292524] bg-black p-6 text-center text-[11px] uppercase tracking-widest text-[#78716C]">
          COMPUTING FINGERPRINTS <span className="cursor-blink" />
        </div>
      )}

      {result && !scanning && (
        <div className="border border-t-0 border-[#292524] bg-black">
          {result.groups.length === 0 && (
            <div className="p-12 text-center text-[11px] uppercase tracking-widest text-[#78716C]">
              &gt; NO DUPLICATES AT {(threshold * 100).toFixed(0)}% SIMILARITY
            </div>
          )}
          {result.groups.map((g, gi) => (
            <div key={g.group_id} className="border-b border-[#292524]" data-testid={IDS_DUP.group(g.group_id)}>
              <div className="flex justify-between items-center px-4 py-2 bg-[#0C0C0C] border-b border-[#292524]">
                <div className="text-[10px] uppercase tracking-widest text-[#A8A29E]">
                  GROUP {String(gi + 1).padStart(2, "0")} · {g.count} FILES
                </div>
                <div className="text-[10px] uppercase tracking-widest text-[#78716C]">
                  KEEP:  <span className="text-[#00FF66]">HIGHEST CONFIDENCE + SIZE</span>
                </div>
              </div>
              <table className="w-full border-collapse">
                <tbody>
                  {g.tracks.map((t) => (
                    <tr
                      key={t.id}
                      data-testid={IDS_DUP.dupRow(t.id)}
                      className={`border-b border-[#292524] transition-colors ${
                        t.is_keeper
                          ? "bg-[#00FF66]/5 hover:bg-[#00FF66]/10"
                          : "hover:bg-[#1A1A1A]"
                      }`}
                    >
                      <td className="w-12 px-4 py-2 text-center">
                        {t.is_keeper ? (
                          <span className="text-[10px] uppercase tracking-widest text-[#00FF66]">KEEP</span>
                        ) : (
                          <input
                            data-testid={IDS_DUP.dupCheckbox(t.id)}
                            type="checkbox"
                            checked={!!selected[t.id]}
                            onChange={(e) => setSelected({ ...selected, [t.id]: e.target.checked })}
                            className="accent-[#FF0033]"
                          />
                        )}
                      </td>
                      <td className="py-2 px-2 text-sm">
                        <div className="text-white truncate max-w-[400px]">{t.title || t.filename}</div>
                        <div className="text-[10px] text-[#78716C] truncate max-w-[400px]">{t.path}</div>
                      </td>
                      <td className="py-2 px-2 text-xs text-[#A8A29E] w-40 truncate">{t.artist || "—"}</td>
                      <td className="py-2 px-2 text-xs text-[#A8A29E] w-40 truncate">{t.album || "—"}</td>
                      <td className="py-2 px-2 text-xs font-mono w-20 text-[#78716C]">
                        {t.size_bytes ? (t.size_bytes / 1024).toFixed(0) + "K" : "—"}
                      </td>
                      <td className="py-2 px-2 text-xs font-mono w-24">
                        <span style={{ color: t.similarity >= 0.99 ? "#00FF66" : t.similarity >= 0.95 ? "#FFD700" : "#A8A29E" }}>
                          {(t.similarity * 100).toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div className="px-4 py-3 bg-[#0C0C0C] text-[10px] uppercase tracking-widest text-[#78716C] flex justify-between">
            <span>ANALYZED: {result.total_tracks_analyzed}</span>
            <span>MISSING FINGERPRINT: {result.tracks_missing_fingerprint}</span>
            <span>THRESHOLD: {(result.threshold * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
