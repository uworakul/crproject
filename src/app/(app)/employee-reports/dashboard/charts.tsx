"use client";

// Chart primitives for the employee Dashboard (2026-09-23) — plain inline
// SVG, no charting library, following the dataviz skill's method: fixed
// categorical hue order for pie's per-slice identity, a single sequential
// hue for bar/line (an ordered/ranked measure, not distinct series, so no
// per-item color or legend is needed there — "a single series needs no
// legend box"), thin marks (bars <=22px with a rounded data-end, 2px
// lines, >=8px markers with a surface ring), hairline recessive gridlines,
// and a native <title> tooltip on every mark. Light mode only — this app
// has no dark theme.
import type { ChartDatum } from "@/lib/reports/dashboard-data";

// Reference categorical palette (dataviz skill, references/palette.md) —
// fixed order, never cycled/reassigned per filter change.
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SEQUENTIAL = "#2a78d6"; // blue, step 450 — the single-hue for magnitude/ranked charts
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", gridline: "#e1e0d9", baseline: "#c3c2b7", surface: "#fcfcfb" };

function formatValue(v: number, unit: string) {
  const n = Number.isInteger(v) ? v.toLocaleString("th-TH") : v.toLocaleString("th-TH", { maximumFractionDigits: 1 });
  return `${n}${unit === "%" ? "%" : ` ${unit}`}`;
}

export function TableView({ data, unit }: { data: ChartDatum[]; unit: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-300 text-left text-gray-600">
          <th className="py-2 pr-4">รายการ</th>
          <th className="py-2 pr-4 text-right">ค่า</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2 pr-4">{d.label}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatValue(d.value, unit)}</td>
          </tr>
        ))}
        <tr className="font-medium">
          <td className="py-2 pr-4">รวม</td>
          <td className="py-2 pr-4 text-right tabular-nums">{formatValue(total, unit === "%" ? "" : unit)}</td>
        </tr>
      </tbody>
    </table>
  );
}

// Horizontal bars — reads better than vertical columns once category names
// are site/department names rather than short codes.
export function BarChartView({ data, unit }: { data: ChartDatum[]; unit: string }) {
  if (data.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const rowHeight = 28;
  const barThickness = 18;
  const labelWidth = 200;
  const chartWidth = 480;
  const height = data.length * rowHeight + 20;
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <svg width="100%" viewBox={`0 0 ${labelWidth + chartWidth + 70} ${height}`} role="img" aria-label="แผนภูมิแท่ง">
      {/* gridlines at 0/25/50/75/100% of max */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={labelWidth + f * chartWidth} y1={0} x2={labelWidth + f * chartWidth} y2={height - 20} stroke={INK.gridline} strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const y = i * rowHeight + (rowHeight - barThickness) / 2;
        const w = (d.value / max) * chartWidth;
        return (
          <g key={d.label}>
            <title>
              {d.label}: {formatValue(d.value, unit)}
            </title>
            <text x={labelWidth - 8} y={y + barThickness / 2 + 4} textAnchor="end" fontSize={12} fill={INK.secondary}>
              {d.label.length > 26 ? `${d.label.slice(0, 25)}…` : d.label}
            </text>
            <rect x={labelWidth} y={y} width={Math.max(w, 2)} height={barThickness} rx={4} fill={SEQUENTIAL} />
            <text x={labelWidth + w + 6} y={y + barThickness / 2 + 4} fontSize={12} fill={INK.primary}>
              {formatValue(d.value, unit)}
            </text>
          </g>
        );
      })}
      <line x1={labelWidth} y1={height - 20} x2={labelWidth + chartWidth} y2={height - 20} stroke={INK.baseline} strokeWidth={1} />
    </svg>
  );
}

// Position on the x-axis already carries category order/identity, so this
// stays one hue — same rationale as the bar chart above.
export function LineChartView({ data, unit }: { data: ChartDatum[]; unit: string }) {
  if (data.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const width = 640;
  const height = 300;
  const padding = { top: 16, right: 16, bottom: 56, left: 48 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;
  const max = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? plotW / (data.length - 1) : 0;
  const points = data.map((d, i) => ({ x: padding.left + i * stepX, y: padding.top + plotH - (d.value / max) * plotH, d }));
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="แผนภูมิเส้น">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padding.left} y1={padding.top + f * plotH} x2={width - padding.right} y2={padding.top + f * plotH} stroke={INK.gridline} strokeWidth={1} />
      ))}
      <path d={path} fill="none" stroke={SEQUENTIAL} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p) => (
        <g key={p.d.label}>
          <title>
            {p.d.label}: {formatValue(p.d.value, unit)}
          </title>
          <circle cx={p.x} cy={p.y} r={4} fill={SEQUENTIAL} stroke={INK.surface} strokeWidth={2} />
          <text
            x={p.x}
            y={height - padding.bottom + 16}
            textAnchor="end"
            fontSize={11}
            fill={INK.muted}
            transform={`rotate(-35 ${p.x} ${height - padding.bottom + 16})`}
          >
            {p.d.label.length > 16 ? `${p.d.label.slice(0, 15)}…` : p.d.label}
          </text>
        </g>
      ))}
      <line x1={padding.left} y1={padding.top + plotH} x2={width - padding.right} y2={padding.top + plotH} stroke={INK.baseline} strokeWidth={1} />
    </svg>
  );
}

// Pie — the one mode where each slice genuinely needs its own hue (no
// axis position to carry identity), so this uses the fixed categorical
// order. Capped at the first 7 slots + "อื่นๆ" (a neutral gray, not an
// 8th categorical hue) — past that, per-pair legibility and the pie form
// itself both degrade, and the raw list is always one click away in the
// table view.
export function PieChartView({ data, unit }: { data: ChartDatum[]; unit: string }) {
  if (data.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const CAP = 7;
  let slices = data;
  if (data.length > CAP + 1) {
    const top = data.slice(0, CAP);
    const rest = data.slice(CAP).reduce((s, d) => s + d.value, 0);
    slices = [...top, { label: "อื่นๆ", value: rest }];
  }
  const total = slices.reduce((s, d) => s + d.value, 0) || 1;
  const size = 220;
  const r = size / 2;
  const cx = r;
  const cy = r;
  // Built with reduce (not a mutated loop variable across .map iterations)
  // so cumulative angle tracking stays a pure fold, safe under the React
  // Compiler's immutability rule.
  const arcs = slices.reduce<{ cumulative: number; items: { d: string; color: string; label: string; value: number }[] }>(
    (acc, d, i) => {
      const sweep = (d.value / total) * 360;
      const start = (acc.cumulative * Math.PI) / 180;
      const nextCumulative = acc.cumulative + sweep;
      const end = (nextCumulative * Math.PI) / 180;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const largeArc = sweep > 180 ? 1 : 0;
      const color = d.label === "อื่นๆ" ? INK.muted : CATEGORICAL[i % CATEGORICAL.length];
      const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { cumulative: nextCumulative, items: [...acc.items, { d: path, color, label: d.label, value: d.value }] };
    },
    { cumulative: -90, items: [] },
  ).items;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="แผนภูมิวงกลม">
        {arcs.map((a) => (
          <path key={a.label} d={a.d} fill={a.color} stroke={INK.surface} strokeWidth={2}>
            <title>
              {a.label}: {formatValue(a.value, unit)} ({((a.value / total) * 100).toFixed(1)}%)
            </title>
          </path>
        ))}
      </svg>
      <ul className="flex flex-col gap-1 text-sm">
        {arcs.map((a) => (
          <li key={a.label} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: a.color }} />
            <span className="text-gray-800">{a.label}</span>
            <span className="text-gray-500 tabular-nums">
              {formatValue(a.value, unit)} · {((a.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
