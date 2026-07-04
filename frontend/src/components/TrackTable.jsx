import { IDS } from "@/testIds";

const STATUS_COLORS = {
  identified: "text-[#00FF66] border-[#00FF66]/40 bg-[#00FF66]/10",
  unknown: "text-[#FF0033] border-[#FF0033]/40 bg-[#FF0033]/10",
  low_confidence: "text-[#FFD700] border-[#FFD700]/40 bg-[#FFD700]/10",
  error: "text-[#FF0033] border-[#FF0033]/40 bg-[#FF0033]/10",
};

const fmtDuration = (s) => {
  if (!s) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
};

export default function TrackTable({ tracks, loading, onFix, onCover }) {
  return (
    <div className="border border-t-0 border-[#292524] bg-black overflow-x-auto">
      <table className="w-full border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-[#0C0C0C] border-b border-[#292524] text-[#A8A29E] font-mono text-[10px] uppercase tracking-widest text-left">
            <th className="py-3 px-4 w-10">#</th>
            <th className="py-3 px-4">FILE / TITLE</th>
            <th className="py-3 px-4">ARTIST</th>
            <th className="py-3 px-4">ALBUM</th>
            <th className="py-3 px-4 w-24">DURATION</th>
            <th className="py-3 px-4 w-32">STATUS</th>
            <th className="py-3 px-4 w-24">CONF.</th>
            <th className="py-3 px-4 w-40 text-right">ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={8} className="text-center py-16 text-[#78716C] text-xs uppercase tracking-widest">
              LOADING <span className="cursor-blink" />
            </td></tr>
          )}
          {!loading && tracks.length === 0 && (
            <tr><td colSpan={8} className="text-center py-16 text-[#78716C] text-xs uppercase tracking-widest">
              &gt; NO TRACKS · RUN A SCAN OR SEED SAMPLES
            </td></tr>
          )}
          {!loading && tracks.map((t, idx) => {
            const s = STATUS_COLORS[t.status] || STATUS_COLORS.unknown;
            return (
              <tr
                key={t.id}
                data-testid={IDS.tableRow(t.id)}
                className="border-b border-[#292524] hover:bg-[#1A1A1A] transition-colors"
              >
                <td className="py-2 px-4 text-[10px] text-[#78716C] font-mono">{String(idx + 1).padStart(3, "0")}</td>
                <td className="py-2 px-4 text-sm">
                  <div className="text-white font-medium truncate max-w-[280px]">{t.title || t.filename}</div>
                  {t.title && <div className="text-[10px] text-[#78716C] truncate max-w-[280px]">{t.filename}</div>}
                </td>
                <td className="py-2 px-4 text-xs text-[#A8A29E]">{t.artist || <span className="text-[#78716C]">—</span>}</td>
                <td className="py-2 px-4 text-xs text-[#A8A29E]">{t.album || <span className="text-[#78716C]">—</span>}</td>
                <td className="py-2 px-4 text-xs text-[#A8A29E] font-mono">{fmtDuration(t.duration)}</td>
                <td className="py-2 px-4">
                  <span className={`inline-block px-2 py-1 text-[10px] uppercase tracking-widest border ${s}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </td>
                <td className="py-2 px-4 text-xs font-mono">
                  <span style={{ color: t.confidence >= 0.8 ? "#00FF66" : t.confidence >= 0.4 ? "#FFD700" : "#78716C" }}>
                    {(t.confidence * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-2 px-4 text-right space-x-1 whitespace-nowrap">
                  <button
                    data-testid={IDS.fixBtn(t.id)}
                    onClick={() => onFix(t)}
                    className="text-[10px] uppercase tracking-wider text-[#FF3300] hover:text-white hover:bg-[#FF3300] border border-[#FF3300]/40 px-2 py-1 transition-colors"
                  >
                    FIX
                  </button>
                  <button
                    data-testid={IDS.coverBtn(t.id)}
                    onClick={() => onCover(t)}
                    className="text-[10px] uppercase tracking-wider text-white hover:text-black hover:bg-white border border-white/40 px-2 py-1 transition-colors"
                  >
                    ▲ COVER
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
