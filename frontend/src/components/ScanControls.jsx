import { useState } from "react";
import { IDS } from "@/testIds";

export default function ScanControls({ defaultFolder, libraryRoot, onScan, onSeed, busy }) {
  const [folder, setFolder] = useState(defaultFolder || libraryRoot || "");
  const [useAcoustid, setUseAcoustid] = useState(false);

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      <input
        data-testid={IDS.scanFolderInput}
        value={folder}
        onChange={(e) => setFolder(e.target.value)}
        placeholder="/absolute/path/to/music"
        className="bg-[#0C0C0C] border border-[#292524] text-white rounded-none focus:border-[#FF3300] focus:outline-none px-3 py-2 font-mono text-xs w-full sm:w-[380px]"
      />
      <label className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[#A8A29E] cursor-pointer select-none">
        <input
          data-testid={IDS.useAcoustidToggle}
          type="checkbox"
          checked={useAcoustid}
          onChange={(e) => setUseAcoustid(e.target.checked)}
          className="accent-[#FF3300]"
        />
        <span>+ acoustid</span>
      </label>
      <button
        data-testid={IDS.scanBtn}
        onClick={() => onScan(folder, useAcoustid)}
        disabled={busy || !folder}
        className="bg-[#FF3300] text-black hover:bg-[#E62E00] rounded-none border border-[#FF3300] px-5 py-2 font-mono text-[11px] uppercase tracking-wider font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        ▶ SCAN
      </button>
      <button
        data-testid={IDS.seedBtn}
        onClick={onSeed}
        disabled={busy}
        className="bg-transparent text-[#A8A29E] hover:text-white border border-[#292524] hover:border-[#A8A29E] rounded-none px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-colors disabled:opacity-30"
      >
        + SAMPLE DATA
      </button>
    </div>
  );
}
