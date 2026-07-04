import { IDS } from "@/testIds";

function Cell({ label, value, accent, testId }) {
  return (
    <div className="p-6 border border-[#292524] bg-[#0C0C0C] flex flex-col gap-2 reveal">
      <div className="text-[10px] uppercase tracking-[0.3em] text-[#78716C]">{label}</div>
      <div
        data-testid={testId}
        className="text-4xl font-mono font-bold tracking-tighter"
        style={{ color: accent || "#fff" }}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

export default function StatsRow({ stats }) {
  const identifiedPct = stats?.identified_pct
    ? `${stats.identified_pct.toFixed(0)}%`
    : "—";
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-8">
      <Cell label="TOTAL TRACKS" value={stats?.total} testId={IDS.statTotal} />
      <Cell
        label={`IDENTIFIED · ${identifiedPct}`}
        value={stats?.identified}
        accent="#00FF66"
        testId={IDS.statIdentified}
      />
      <Cell
        label="LOW CONFIDENCE"
        value={stats?.low_confidence}
        accent="#FFD700"
        testId={IDS.statLow}
      />
      <Cell
        label="UNKNOWN"
        value={stats?.unknown}
        accent="#FF0033"
        testId={IDS.statUnknown}
      />
    </div>
  );
}
