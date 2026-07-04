import { useState } from "react";
import { IDS } from "@/testIds";

export default function FixModal({ track, onClose, onSave, onIdentify, acoustidReady }) {
  const [form, setForm] = useState({
    title: track.title || "",
    artist: track.artist || "",
    album: track.album || "",
    year: track.year || "",
    genre: track.genre || "",
    track_number: track.track_number || "",
  });
  const [applyToFile, setApplyToFile] = useState(true);

  const field = (name, label) => (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-widest text-[#78716C]">{label}</label>
      <input
        value={form[name]}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
        className="bg-black border border-[#292524] text-white rounded-none px-3 py-2 font-mono text-sm focus:outline-none focus:border-[#FF3300]"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#0C0C0C] border border-[#292524] max-w-2xl w-full p-6 reveal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start mb-6 pb-4 border-b border-[#292524]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[#78716C]">EDIT · TRACK METADATA</div>
            <div className="text-xl font-display font-bold text-white mt-1 truncate max-w-[500px]">{track.filename}</div>
            <div className="text-[10px] text-[#78716C] mt-1 truncate max-w-[500px]">{track.path}</div>
          </div>
          <button
            data-testid={IDS.closeModal}
            onClick={onClose}
            className="text-[#78716C] hover:text-white text-2xl leading-none"
          >×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          {field("title", "TITLE")}
          {field("artist", "ARTIST")}
          {field("album", "ALBUM")}
          {field("year", "YEAR")}
          {field("genre", "GENRE")}
          {field("track_number", "TRACK #")}
        </div>

        <label className="flex items-center gap-2 text-xs text-[#A8A29E] mb-6 cursor-pointer select-none">
          <input
            data-testid={IDS.applyToFile}
            type="checkbox"
            checked={applyToFile}
            onChange={(e) => setApplyToFile(e.target.checked)}
            className="accent-[#FF3300]"
          />
          <span className="uppercase tracking-widest">WRITE ID3 TAGS TO FILE</span>
        </label>

        <div className="flex justify-between items-center flex-wrap gap-2">
          <button
            data-testid={IDS.identifyOne}
            disabled={!acoustidReady}
            onClick={async () => { await onIdentify(track.id); onClose(); }}
            className="bg-transparent border border-[#FF3300] text-[#FF3300] hover:bg-[#FF3300] hover:text-black px-4 py-2 text-[11px] uppercase tracking-widest transition-colors disabled:opacity-30"
          >
            ⌕ TRY ACOUSTID
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="border border-[#292524] hover:border-[#A8A29E] text-[#A8A29E] hover:text-white px-4 py-2 text-[11px] uppercase tracking-widest transition-colors"
            >
              CANCEL
            </button>
            <button
              data-testid={IDS.saveEdits}
              onClick={async () => { await onSave(track.id, form, applyToFile); onClose(); }}
              className="bg-[#FF3300] text-black hover:bg-[#E62E00] border border-[#FF3300] px-6 py-2 text-[11px] uppercase tracking-widest font-bold transition-colors"
            >
              SAVE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
