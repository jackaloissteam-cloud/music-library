import { useState } from "react";
import { IDS } from "@/testIds";

export default function CoverModal({ track, onClose, onGenerate }) {
  const [model, setModel] = useState("nano-banana");
  const [style, setStyle] = useState("modern editorial vinyl sleeve, bold typography avoided, rich color grading");
  const [embed, setEmbed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(track.cover_data_url || null);

  const doGen = async () => {
    setBusy(true);
    try {
      const r = await onGenerate(track.id, model, style, embed);
      if (r?.cover_data_url) setPreview(r.cover_data_url);
    } catch (_) {
      // error already toasted upstream
    } finally { setBusy(false); }
  };

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0C0C0C] border border-[#292524] max-w-3xl w-full p-6 reveal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6 pb-4 border-b border-[#292524]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#78716C]">GENERATE · COVER ARTWORK</div>
            <div className="text-xl font-display font-bold text-white mt-1 truncate max-w-[500px]">
              {track.title || track.filename}
            </div>
            <div className="text-[10px] text-[#A8A29E] mt-1 truncate max-w-[500px]">
              {track.artist || "unknown artist"} · {track.album || "unknown album"}
            </div>
          </div>
          <button onClick={onClose} className="text-[#78716C] hover:text-white text-2xl leading-none">×</button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Preview */}
          <div className="aspect-square border border-[#292524] bg-black flex items-center justify-center overflow-hidden">
            {preview ? (
              <img src={preview} alt="cover preview" className="w-full h-full object-cover" />
            ) : (
              <div className="text-[10px] uppercase tracking-widest text-[#78716C]">&gt; NO COVER · GENERATE ONE</div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#78716C]">MODEL</label>
              <select
                data-testid={IDS.modelSelect}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full mt-1 bg-black border border-[#292524] text-white rounded-none px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#FF3300]"
              >
                <option value="nano-banana">Gemini · Nano Banana (3.1 Flash Image)</option>
                <option value="gpt-image-1">OpenAI · GPT Image 1</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-widest text-[#78716C]">STYLE HINT</label>
              <textarea
                rows={4}
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full mt-1 bg-black border border-[#292524] text-white rounded-none px-3 py-2 font-mono text-xs focus:outline-none focus:border-[#FF3300] resize-none"
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-[#A8A29E] cursor-pointer select-none">
              <input
                data-testid={IDS.embedCover}
                type="checkbox"
                checked={embed}
                onChange={(e) => setEmbed(e.target.checked)}
                className="accent-[#FF3300]"
              />
              <span className="uppercase tracking-widest">EMBED INTO .MP3 FILE</span>
            </label>

            <button
              data-testid={IDS.generateCover}
              onClick={doGen}
              disabled={busy}
              className="bg-[#FF3300] text-black hover:bg-[#E62E00] border border-[#FF3300] px-6 py-3 text-[11px] uppercase tracking-widest font-bold transition-colors disabled:opacity-30"
            >
              {busy ? "GENERATING..." : "▶ GENERATE COVER"}
            </button>
            <div className="text-[10px] text-[#78716C] uppercase tracking-widest">
              ~10-60s · uses emergent llm key
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
