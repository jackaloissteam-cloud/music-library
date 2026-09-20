import { useEffect, useRef, useState } from "react";
import { API } from "@/App";
import { IDS_PL } from "@/testIds";

export default function PlayerBar({ queue, index, queueName, onIndexChange, onClose }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const current = queue?.[index];

  useEffect(() => {
    if (!audioRef.current || !current) return;
    audioRef.current.src = `${API}/audio/${current.id}`;
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [current?.id]);

  const toggle = () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) audioRef.current.play().then(() => setPlaying(true));
    else { audioRef.current.pause(); setPlaying(false); }
  };
  const next = () => index < queue.length - 1 && onIndexChange(index + 1);
  const prev = () => index > 0 && onIndexChange(index - 1);
  const fmt = (s) => { if (!s) return "0:00"; const m = Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,"0")}`; };

  if (!current) return null;
  const pct = duration ? (progress / duration) * 100 : 0;

  return (
    <div data-testid={IDS_PL.playerBar} className="fixed bottom-0 left-0 right-0 z-40 bg-[#0C0C0C] border-t-2 border-[#FF3300]">
      <div className="max-w-[1600px] mx-auto px-6 py-3 flex items-center gap-4">
        <div className="w-10 h-10 bg-black border border-[#292524] flex-shrink-0 flex items-center justify-center overflow-hidden">
          {current.cover_data_url ? (
            <img src={current.cover_data_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[#78716C] text-xs">♪</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-white truncate">{current.title || current.filename}</div>
          <div className="text-[10px] text-[#78716C] truncate">
            {current.artist || "—"} · <span className="text-[#FF3300]">{queueName}</span> · {index + 1}/{queue.length}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button data-testid={IDS_PL.playerPrev} onClick={prev} disabled={index === 0}
            className="text-[#A8A29E] hover:text-white disabled:opacity-30 text-lg px-2">⏮</button>
          <button data-testid={IDS_PL.playerPlay} onClick={toggle}
            className="bg-[#FF3300] text-black hover:bg-[#E62E00] w-10 h-10 flex items-center justify-center text-lg font-bold transition-colors">
            {playing ? "▮▮" : "▶"}
          </button>
          <button data-testid={IDS_PL.playerNext} onClick={next} disabled={index >= queue.length - 1}
            className="text-[#A8A29E] hover:text-white disabled:opacity-30 text-lg px-2">⏭</button>
        </div>
        <div className="hidden md:flex items-center gap-2 min-w-[220px]">
          <span className="text-[10px] text-[#78716C] font-mono w-10 text-right">{fmt(progress)}</span>
          <div className="flex-1 h-1 bg-[#292524] cursor-pointer" onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const p = (e.clientX - rect.left) / rect.width;
            if (audioRef.current && duration) audioRef.current.currentTime = p * duration;
          }}>
            <div className="h-full bg-[#FF3300]" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[10px] text-[#78716C] font-mono w-10">{fmt(duration)}</span>
        </div>
        <button onClick={onClose} className="text-[#78716C] hover:text-white text-lg px-2">×</button>
      </div>
      <audio ref={audioRef}
        onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={next}
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
      />
    </div>
  );
}
