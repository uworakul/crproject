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
import { useState } from "react";
import type { ChartDatum, GroupedResult, SitePerformanceResult, UniformProfitResult, DamageResult } from "@/lib/reports/dashboard-data";
import type { DrilldownResult } from "@/lib/reports/dashboard-drilldown";

function formatBaht(v: number) {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

// Reference categorical palette (dataviz skill, references/palette.md) —
// fixed order, never cycled/reassigned per filter change.
const CATEGORICAL = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const SEQUENTIAL = "#2a78d6"; // blue, step 450 — the single-hue for magnitude/ranked charts
const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", gridline: "#e1e0d9", baseline: "#c3c2b7", surface: "#fcfcfb" };

function formatValue(v: number, unit: string) {
  const n = Number.isInteger(v) ? v.toLocaleString("th-TH") : v.toLocaleString("th-TH", { maximumFractionDigits: 1 });
  return `${n}${unit === "%" ? "%" : ` ${unit}`}`;
}

export function TableView({ data, unit, onSelect }: { data: ChartDatum[]; unit: string; onSelect?: (label: string) => void }) {
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
          <tr
            key={d.label}
            onClick={onSelect ? () => onSelect(d.label) : undefined}
            className={`border-b border-gray-100 hover:bg-gray-50 ${onSelect ? "cursor-pointer" : ""}`}
          >
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
export function BarChartView({
  data,
  unit,
  onSelect,
  colorFor,
}: {
  data: ChartDatum[];
  unit: string;
  onSelect?: (label: string) => void;
  // Optional per-bar color override (2026-09-28) — used by the
  // site-performance/uniform-profit profit-vs-loss charts to color losses
  // red and profit green, instead of every other metric here which is a
  // plain ranked magnitude (no positive/negative meaning) and stays the
  // single sequential hue.
  colorFor?: (d: ChartDatum) => string;
}) {
  if (data.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const rowHeight = 28;
  const barThickness = 18;
  const labelWidth = 200;
  const chartWidth = 480;
  const height = data.length * rowHeight + 20;
  // Magnitude drives bar width (a negative value can't produce a negative
  // rect width) — the displayed number below still shows the real signed
  // value via formatValue(d.value, ...), so a loss reads e.g. "-72.1%" next
  // to a bar sized by its 72.1 magnitude, not silently shown as positive.
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);

  return (
    <svg width="100%" viewBox={`0 0 ${labelWidth + chartWidth + 70} ${height}`} role="img" aria-label="แผนภูมิแท่ง">
      {/* gridlines at 0/25/50/75/100% of max */}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={labelWidth + f * chartWidth} y1={0} x2={labelWidth + f * chartWidth} y2={height - 20} stroke={INK.gridline} strokeWidth={1} />
      ))}
      {data.map((d, i) => {
        const y = i * rowHeight + (rowHeight - barThickness) / 2;
        const w = (Math.abs(d.value) / max) * chartWidth;
        return (
          <g key={d.label} onClick={onSelect ? () => onSelect(d.label) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
            {/* A single string child, not `{a}: {b}` (which JSX compiles to a
                multi-element children array) — React's SSR <title> serializer
                silently renders an EMPTY <title> for any array of length > 1
                (see pushTitleImpl in react-dom-server), while the client
                mounts all children normally. That server/client divergence
                is a real hydration mismatch, not a false positive. */}
            <title>{`${d.label}: ${formatValue(d.value, unit)}`}</title>
            <text x={labelWidth - 8} y={y + barThickness / 2 + 4} textAnchor="end" fontSize={12} fill={INK.secondary}>
              {d.label.length > 26 ? `${d.label.slice(0, 25)}…` : d.label}
            </text>
            <rect x={labelWidth} y={y} width={Math.max(w, 2)} height={barThickness} rx={4} fill={colorFor ? colorFor(d) : SEQUENTIAL} />
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
export function LineChartView({ data, unit, onSelect }: { data: ChartDatum[]; unit: string; onSelect?: (label: string) => void }) {
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
        <g key={p.d.label} onClick={onSelect ? () => onSelect(p.d.label) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
          <title>{`${p.d.label}: ${formatValue(p.d.value, unit)}`}</title>
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
export function PieChartView({
  data,
  unit,
  onSelect,
  colorFor,
}: {
  data: ChartDatum[];
  unit: string;
  onSelect?: (label: string) => void;
  // Optional per-slice color override, same rationale as BarChartView's —
  // the synthetic "อื่นๆ" slice always stays neutral gray regardless.
  colorFor?: (d: ChartDatum) => string;
}) {
  if (data.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const CAP = 7;
  let slices: (ChartDatum & { synthetic?: boolean })[] = data;
  if (data.length > CAP + 1) {
    const top = data.slice(0, CAP);
    const rest = data.slice(CAP).reduce((s, d) => s + Math.abs(d.value), 0);
    slices = [...top, { label: "อื่นๆ", value: rest, synthetic: true }];
  }
  // Magnitude drives slice size (a negative value can't produce a negative
  // sweep angle) — displayed numbers/tooltips still show the real signed
  // value via formatValue(a.value, ...) below, so a loss slice is sized
  // correctly but still reads as negative, same rationale as BarChartView.
  const total = slices.reduce((s, d) => s + Math.abs(d.value), 0) || 1;
  const size = 220;
  const r = size / 2;
  const cx = r;
  const cy = r;
  // Built with reduce (not a mutated loop variable across .map iterations)
  // so cumulative angle tracking stays a pure fold, safe under the React
  // Compiler's immutability rule.
  const arcs = slices.reduce<{ cumulative: number; items: { d: string; color: string; label: string; value: number; synthetic?: boolean }[] }>(
    (acc, d, i) => {
      const sweep = (Math.abs(d.value) / total) * 360;
      const start = (acc.cumulative * Math.PI) / 180;
      const nextCumulative = acc.cumulative + sweep;
      const end = (nextCumulative * Math.PI) / 180;
      const x1 = cx + r * Math.cos(start);
      const y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end);
      const y2 = cy + r * Math.sin(end);
      const largeArc = sweep > 180 ? 1 : 0;
      const color = d.synthetic ? INK.muted : colorFor ? colorFor(d) : CATEGORICAL[i % CATEGORICAL.length];
      // A single slice covering 100% has identical start/end points, so one
      // arc draws nothing — use two half-circle arcs instead.
      const path =
        sweep >= 359.99
          ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx} ${cy + r} A ${r} ${r} 0 1 1 ${cx} ${cy - r} Z`
          : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      return { cumulative: nextCumulative, items: [...acc.items, { d: path, color, label: d.label, value: d.value, synthetic: d.synthetic }] };
    },
    { cumulative: -90, items: [] },
  ).items;

  // The "อื่นๆ" slice (synthetic) lumps together several original labels
  // past CAP — it doesn't correspond to any single bucket the backend
  // recognizes, so it's never clickable even when the metric otherwise
  // supports drilldown. Every other slice is its own real bucket.
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="แผนภูมิวงกลม">
        {arcs.map((a) => (
          <path
            key={a.label}
            d={a.d}
            fill={a.color}
            stroke={INK.surface}
            strokeWidth={2}
            onClick={onSelect && !a.synthetic ? () => onSelect(a.label) : undefined}
            style={onSelect && !a.synthetic ? { cursor: "pointer" } : undefined}
          >
            <title>{`${a.label}: ${formatValue(a.value, unit)} (${((a.value / total) * 100).toFixed(1)}%)`}</title>
          </path>
        ))}
      </svg>
      <ul className="flex flex-col gap-1 text-sm">
        {arcs.map((a) => (
          <li
            key={a.label}
            onClick={onSelect && !a.synthetic ? () => onSelect(a.label) : undefined}
            className={`flex items-center gap-2 ${onSelect && !a.synthetic ? "cursor-pointer hover:underline" : ""}`}
          >
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

// --- Grouped (multi-series) views — 2026-09-24 --------------------------
// For "เพศ/ช่วงอายุ ตามหน่วยงาน": each group (site) is a small cluster of
// one thin bar per series (gender, or age bucket), colored from the fixed
// categorical order since — unlike the single-series bar/line above — the
// series here really are distinct identities being compared, not one
// ranked measure. A legend is mandatory (>=2 series).

export function GroupedTableView({ result, onSelect }: { result: GroupedResult; onSelect?: (group: string, series: string) => void }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-gray-300 text-left text-gray-600">
          <th className="py-2 pr-4">หน่วยงาน</th>
          {result.series.map((s) => (
            <th key={s.name} className="py-2 pr-4 text-right">
              {s.name}
            </th>
          ))}
          <th className="py-2 pr-4 text-right">รวม</th>
        </tr>
      </thead>
      <tbody>
        {result.groups.map((g, i) => (
          <tr key={g} className="border-b border-gray-100 hover:bg-gray-50">
            <td className="py-2 pr-4">{g}</td>
            {result.series.map((s) => (
              <td
                key={s.name}
                onClick={onSelect ? () => onSelect(g, s.name) : undefined}
                className={`py-2 pr-4 text-right tabular-nums ${onSelect ? "cursor-pointer hover:underline" : ""}`}
              >
                {s.values[i].toLocaleString("th-TH")} {result.unit}
              </td>
            ))}
            <td className="py-2 pr-4 text-right font-medium tabular-nums">
              {result.series.reduce((sum, s) => sum + s.values[i], 0).toLocaleString("th-TH")} {result.unit}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GroupedBarChartView({ result, onSelect }: { result: GroupedResult; onSelect?: (group: string, series: string) => void }) {
  const { groups, series, unit } = result;
  if (groups.length === 0 || series.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;

  const barThickness = 14;
  const seriesGap = 2;
  const clusterGap = 10;
  const clusterHeight = series.length * (barThickness + seriesGap) + clusterGap;
  const labelWidth = 200;
  const chartWidth = 420;
  const height = groups.length * clusterHeight + 20;
  const max = Math.max(...series.flatMap((s) => s.values), 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {series.map((s, j) => (
          <span key={s.name} className="flex items-center gap-1.5 text-xs text-gray-700">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CATEGORICAL[j % CATEGORICAL.length] }} />
            {s.name}
          </span>
        ))}
      </div>
      <svg width="100%" viewBox={`0 0 ${labelWidth + chartWidth + 70} ${height}`} role="img" aria-label="แผนภูมิแท่งแบบจัดกลุ่ม">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={labelWidth + f * chartWidth} y1={0} x2={labelWidth + f * chartWidth} y2={height - 10} stroke={INK.gridline} strokeWidth={1} />
        ))}
        {groups.map((g, i) => {
          const clusterTop = i * clusterHeight + clusterGap / 2;
          return (
            <g key={g}>
              <text x={labelWidth - 8} y={clusterTop + (series.length * (barThickness + seriesGap)) / 2} textAnchor="end" fontSize={12} fill={INK.secondary}>
                {g.length > 26 ? `${g.slice(0, 25)}…` : g}
              </text>
              {series.map((s, j) => {
                const y = clusterTop + j * (barThickness + seriesGap);
                const value = s.values[i];
                const w = (value / max) * chartWidth;
                return (
                  <g key={s.name} onClick={onSelect ? () => onSelect(g, s.name) : undefined} style={onSelect ? { cursor: "pointer" } : undefined}>
                    <title>{`${g} — ${s.name}: ${value.toLocaleString("th-TH")} ${unit}`}</title>
                    <rect x={labelWidth} y={y} width={Math.max(w, value > 0 ? 2 : 0)} height={barThickness} rx={3} fill={CATEGORICAL[j % CATEGORICAL.length]} />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- Site performance / uniform P&L (2026-09-28) ------------------------
// Neither metric fits the plain {label,value}[] shape (each row has
// several distinct amounts, not one) — dedicated table components, but
// Bar/Pie reuse the existing single-series views above by having the
// caller (dashboard-view.tsx) derive a ChartDatum[] from whichever one
// column is the headline number for that view.

export function SitePerformanceTableView({ result }: { result: SitePerformanceResult }) {
  if (result.rows.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-600">
            <th className="py-2 pr-4">หน่วยงาน</th>
            <th className="py-2 pr-4 text-right">จำนวนคน</th>
            <th className="py-2 pr-4 text-right">รายได้ต่อเดือน (บาท)</th>
            <th className="py-2 pr-4 text-right">รายได้พนักงานรวม (บาท)</th>
            <th className="py-2 pr-4 text-right">กำไร/ขาดทุน (บาท)</th>
            <th className="py-2 pr-4 text-right">กำไร/ขาดทุน (%)</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.siteCode} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-4">{r.label}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.headcount.toLocaleString("th-TH")}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatBaht(r.revenue)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatBaht(r.employeeIncome)}</td>
              <td className={`py-2 pr-4 text-right tabular-nums ${r.profit < 0 ? "text-red-600" : ""}`}>{formatBaht(r.profit)}</td>
              <td className={`py-2 pr-4 text-right tabular-nums ${r.percent < 0 ? "text-red-600" : ""}`}>{r.percent.toLocaleString("th-TH")}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UniformProfitTableView({ result }: { result: UniformProfitResult }) {
  if (result.rows.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const totals = result.rows.reduce((s, r) => ({ revenue: s.revenue + r.revenue, cost: s.cost + r.cost, profit: s.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 });
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-600">
            <th className="py-2 pr-4">หน่วยงาน</th>
            <th className="py-2 pr-4 text-right">ยอดจำหน่าย (บาท)</th>
            <th className="py-2 pr-4 text-right">ต้นทุนสินค้า (บาท)</th>
            <th className="py-2 pr-4 text-right">กำไร/ขาดทุน (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.map((r) => (
            <tr key={r.siteCode} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-2 pr-4">{r.label}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatBaht(r.revenue)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatBaht(r.cost)}</td>
              <td className={`py-2 pr-4 text-right tabular-nums ${r.profit < 0 ? "text-red-600" : ""}`}>{formatBaht(r.profit)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="py-2 pr-4">รวม</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatBaht(totals.revenue)}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{formatBaht(totals.cost)}</td>
            <td className={`py-2 pr-4 text-right tabular-nums ${totals.profit < 0 ? "text-red-600" : ""}`}>{formatBaht(totals.profit)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// "วิเคราะห์ค่าเสียหาย" (2026-10-09) — table by site + employee with start /
// resign date / tenure, one row per (category, employee) — or per warehouse for
// the stock-count loss category, which has no employee. "ดูรายละเอียด" opens
// that row's underlying lines in the drilldown tab (onViewDetail is
// dashboard-view.tsx's openDrilldown, same mechanism as the chart clicks).
export function DamageTableView({ result, onViewDetail }: { result: DamageResult; onViewDetail: (category: string, key: string, title: string) => void }) {
  if (result.rows.length === 0) return <p className="text-sm text-gray-500">ไม่พบค่าเสียหายในช่วงที่เลือก</p>;
  const grandTotal = result.rows.reduce((s, r) => s + r.amount, 0);
  const order = ["STOCK_LOSS", "BAD_DEBT", "WELFARE"];
  const rows = [...result.rows].sort((a, b) => order.indexOf(a.category) - order.indexOf(b.category) || b.amount - a.amount);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-gray-600">
            <th className="py-2 pr-4">ประเภทค่าเสียหาย</th>
            <th className="py-2 pr-4">หน่วยงาน</th>
            <th className="py-2 pr-4">รหัสพนักงาน</th>
            <th className="py-2 pr-4">ชื่อ-นามสกุล</th>
            <th className="py-2 pr-4">วันเริ่มงาน</th>
            <th className="py-2 pr-4">วันลาออก</th>
            <th className="py-2 pr-4">อายุงาน</th>
            <th className="py-2 pr-4 text-right">ค่าเสียหาย (บาท)</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.category}-${r.key}`} className="border-b border-gray-100 hover:bg-purple-50">
              <td className="py-2 pr-4">{r.categoryLabel}</td>
              <td className="py-2 pr-4">{r.siteName}</td>
              <td className="py-2 pr-4">{r.empCode ?? "-"}</td>
              <td className="py-2 pr-4">{r.fullName ?? "-"}</td>
              <td className="py-2 pr-4">{r.startDate}</td>
              <td className="py-2 pr-4">{r.resignDate}</td>
              <td className="py-2 pr-4">{r.tenure}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-red-600">{formatBaht(r.amount)}</td>
              <td className="py-2 pr-4">
                <button type="button" onClick={() => onViewDetail(r.category, r.key, `${r.categoryLabel} — ${r.fullName ?? r.siteName}`)} className="text-xs text-blue-600 hover:underline">
                  ดูรายละเอียด
                </button>
              </td>
            </tr>
          ))}
          {result.categories.map((c) => (
            <tr key={c.label} className="text-gray-700">
              <td className="py-1 pr-4" colSpan={7}>
                รวม {c.label}
              </td>
              <td className="py-1 pr-4 text-right tabular-nums">{formatBaht(c.value)}</td>
              <td />
            </tr>
          ))}
          <tr className="border-t border-gray-300 font-medium">
            <td className="py-2 pr-4" colSpan={7}>
              รวมค่าเสียหายทั้งหมด
            </td>
            <td className="py-2 pr-4 text-right tabular-nums text-red-600">{formatBaht(grandTotal)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// Scatter (2026-09-28) — only "ผลประกอบการแต่ละหน่วยงาน" uses this
// (จำนวนคน × กำไรบาท, one point per site). Unlike bar/line above, the y
// value (profit) can go negative (a site can genuinely cost more than it
// bills), so the plot domain spans below zero with its own baseline line
// at y=0, instead of assuming 0 is the floor.
export function ScatterChartView({ points, xLabel, yLabel }: { points: { label: string; x: number; y: number }[]; xLabel: string; yLabel: string }) {
  if (points.length === 0) return <p className="text-sm text-gray-500">ไม่มีข้อมูล</p>;
  const width = 640;
  const height = 380;
  const padding = { top: 16, right: 24, bottom: 48, left: 72 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const xMax = Math.max(...points.map((p) => p.x), 1);
  const xMin = 0; // headcount never negative
  const yMax = Math.max(...points.map((p) => p.y), 0);
  const yMin = Math.min(...points.map((p) => p.y), 0);
  const xScale = (x: number) => padding.left + ((x - xMin) / (xMax - xMin || 1)) * plotW;
  const yScale = (y: number) => padding.top + plotH - ((y - yMin) / (yMax - yMin || 1)) * plotH;
  const zeroY = yScale(0);

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="แผนภูมิกระจาย">
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padding.left} y1={padding.top + f * plotH} x2={width - padding.right} y2={padding.top + f * plotH} stroke={INK.gridline} strokeWidth={1} />
      ))}
      {/* y = 0 baseline, distinct from the regular gridlines above when the domain crosses zero */}
      <line x1={padding.left} y1={zeroY} x2={width - padding.right} y2={zeroY} stroke={INK.baseline} strokeWidth={1} />
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + plotH} stroke={INK.baseline} strokeWidth={1} />
      {[0, 0.5, 1].map((f) => (
        <text key={f} x={padding.left - 8} y={padding.top + plotH - f * plotH + 4} textAnchor="end" fontSize={11} fill={INK.muted}>
          {formatBaht(yMin + f * (yMax - yMin))}
        </text>
      ))}
      {[0, 0.5, 1].map((f) => (
        <text key={f} x={padding.left + f * plotW} y={height - padding.bottom + 16} textAnchor="middle" fontSize={11} fill={INK.muted}>
          {Math.round(xMin + f * (xMax - xMin)).toLocaleString("th-TH")}
        </text>
      ))}
      <text x={padding.left + plotW / 2} y={height - 6} textAnchor="middle" fontSize={12} fill={INK.secondary}>
        {xLabel}
      </text>
      <text x={14} y={padding.top + plotH / 2} textAnchor="middle" fontSize={12} fill={INK.secondary} transform={`rotate(-90 14 ${padding.top + plotH / 2})`}>
        {yLabel}
      </text>
      {points.map((p, i) => (
        <g key={p.label}>
          <title>{`${p.label}: ${xLabel} ${p.x.toLocaleString("th-TH")}, ${yLabel} ${formatBaht(p.y)}`}</title>
          <circle cx={xScale(p.x)} cy={yScale(p.y)} r={6} fill={CATEGORICAL[i % CATEGORICAL.length]} stroke={INK.surface} strokeWidth={1.5} fillOpacity={0.85} />
        </g>
      ))}
    </svg>
  );
}

// --- Drilldown table (2026-09-28) ---------------------------------------
// Renders the "which employees" list behind a clicked bar/slice/row.
// Sortable by every column (click header, click again to flip direction) —
// same click-to-sort convention as reference-table.tsx elsewhere in this
// app, including the default sort on the first column rather than leaving
// the table unsorted. Numeric columns (align:"right") compare numerically;
// everything else (including ISO "YYYY-MM-DD" date strings, which already
// sort correctly as plain strings) uses a Thai-aware localeCompare.
export function DrilldownTable({ result, title, onClose }: { result: DrilldownResult; title: string; onClose: () => void }) {
  const [sortKey, setSortKey] = useState(result.columns[0]?.key ?? "");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: string) {
    if (key === sortKey) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const numericKeys = new Set(result.columns.filter((c) => c.align === "right").map((c) => c.key));
  const sortedRows = [...result.rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = numericKeys.has(sortKey) ? Number(av) - Number(bv) : String(av).localeCompare(String(bv), "th");
    return sortDir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="mt-4 rounded border border-gray-300 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">{title}</h3>
        <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
          ปิด ✕
        </button>
      </div>
      {result.rows.length === 0 ? (
        <p className="text-sm text-gray-500">ไม่พบพนักงานที่ตรงกับรายการนี้</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse bg-white text-sm">
            <thead>
              <tr className="border-b border-gray-300 text-gray-600">
                <th className="py-2 px-3 text-right">ลำดับที่</th>
                {result.columns.map((c) => {
                  const active = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`cursor-pointer select-none py-2 px-3 ${c.align === "right" ? "text-right" : "text-left"} hover:bg-gray-100`}
                    >
                      {c.label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2 px-3 text-right tabular-nums text-gray-500">{i + 1}</td>
                  {result.columns.map((c) => (
                    <td key={c.key} className={`py-2 px-3 tabular-nums ${c.align === "right" ? "text-right" : "text-left"}`}>
                      {row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-gray-500">รวม {result.rows.length.toLocaleString("th-TH")} รายการ</p>
    </div>
  );
}
