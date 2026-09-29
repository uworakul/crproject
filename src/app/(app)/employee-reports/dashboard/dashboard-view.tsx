"use client";

import { useState } from "react";
import { toBuddhistYear, toGregorianYear } from "@/lib/buddhist-year";
import SearchableSelect from "../../searchable-select";
import {
  TableView,
  BarChartView,
  PieChartView,
  LineChartView,
  GroupedTableView,
  GroupedBarChartView,
  DrilldownTable,
  SitePerformanceTableView,
  UniformProfitTableView,
  ScatterChartView,
  BadDebtTableView,
} from "./charts";
import type { ChartDatum, GroupedResult, SitePerformanceResult, UniformProfitResult, BadDebtResult } from "@/lib/reports/dashboard-data";
import type { DrilldownResult } from "@/lib/reports/dashboard-drilldown";

interface Period {
  PeriodID: number;
  EmployeeType: string;
  PeriodYear: number;
  PeriodMonth: number;
  StartDate: string;
  EndDate: string;
}
interface DashboardResult {
  data: ChartDatum[];
  unit: string;
}
type ViewMode = "table" | "pie" | "bar" | "line" | "scatter";
const ALL_VIEWS: ViewMode[] = ["table", "pie", "bar", "line"];

// 2026-09-24 — added 4 more metrics on top of the original 3, requested
// with an explicit chart choice each (no Pie/Line for these — the user
// asked for "bar chart และตาราง" specifically), plus two that aren't
// employee data at all (stock/welfare value) so `filterable: false` hides
// the company/dept/site/bank/employee filter row entirely rather than
// showing filters that don't apply to a company-wide inventory figure.
// "grouped" kind = a GroupedResult (multi-series, e.g. gender × site)
// rendered by GroupedTableView/GroupedBarChartView instead of the
// single-series TableView/BarChartView/etc.
// `drillable` (2026-09-28) — whether clicking a bucket/bar/slice opens the
// "which employees" table (see DrilldownTable / /api/employee-dashboard/
// drilldown). False only for the two company-wide inventory metrics, which
// have no employee dimension to drill into at all.
const METRICS = [
  { key: "age", label: "อายุพนักงาน (จำนวนคนต่อช่วงอายุ)", needsPeriod: false, needsYear: false, needsMonth: false, filterable: true, kind: "single" as const, views: ALL_VIEWS, drillable: true },
  {
    key: "headcount-by-site",
    label: "จำนวนคนในหน่วยงาน (Site)",
    needsPeriod: false,
    needsYear: false,
    needsMonth: false,
    filterable: true,
    kind: "single" as const,
    views: ALL_VIEWS,
    drillable: true,
  },
  {
    key: "cost-by-site",
    label: "ค่าใช้จ่ายรวมตามหน่วยงาน (% เทียบทั้งหมด)",
    needsPeriod: true,
    needsYear: false,
    needsMonth: false,
    filterable: true,
    kind: "single" as const,
    views: ALL_VIEWS,
    drillable: true,
  },
  {
    key: "stock-value-monthly",
    label: "มูลค่าสต๊อกสินค้า รายเดือน (ประมาณการ)",
    needsPeriod: false,
    needsYear: false,
    needsMonth: false,
    filterable: false,
    kind: "single" as const,
    views: ["table", "bar"] as ViewMode[],
    drillable: false,
  },
  {
    key: "welfare-value-monthly",
    label: "มูลค่าสินค้าสวัสดิการที่เสียไป (ของฟรี) รายเดือน (ประมาณการ)",
    needsPeriod: false,
    needsYear: false,
    needsMonth: false,
    filterable: false,
    kind: "single" as const,
    views: ["table", "bar"] as ViewMode[],
    drillable: false,
  },
  {
    key: "gender-by-site",
    label: "สัดส่วนเพศ ตามหน่วยงาน",
    needsPeriod: false,
    needsYear: false,
    needsMonth: false,
    filterable: true,
    kind: "grouped" as const,
    views: ["table", "bar"] as ViewMode[],
    drillable: true,
  },
  {
    key: "age-by-site",
    label: "สัดส่วนช่วงอายุ ตามหน่วยงาน",
    needsPeriod: false,
    needsYear: false,
    needsMonth: false,
    filterable: true,
    kind: "grouped" as const,
    views: ["table", "bar"] as ViewMode[],
    drillable: true,
  },
  // "สถิติการลา ประจำปี แยกประเภทลา" (2026-09-24) — total leave days per
  // mst_leave_type for one calendar year, same categorical/magnitude shape
  // as "age"/"headcount-by-site" so all 4 views apply. needsYear (new,
  // alongside needsPeriod) shows a Buddhist-year number input instead of a
  // sys_period dropdown — leave requests aren't scoped to a payroll period.
  {
    key: "leave-stats-by-type",
    label: "สถิติการลา ประจำปี แยกประเภทลา",
    needsPeriod: false,
    needsYear: true,
    needsMonth: false,
    filterable: true,
    kind: "single" as const,
    views: ALL_VIEWS,
    drillable: true,
  },
  // "ผลประกอบการแต่ละหน่วยงาน" (2026-09-28) — MonthlyServiceFee (หน้า
  // หน่วยงาน) vs. total employee GROSS income (not NetPay, not netted
  // against deductions — confirmed by the user) for the selected period,
  // per site. No drilldown (financial aggregate, not a per-employee
  // bucket the generic drilldown endpoint knows how to explain).
  {
    key: "site-performance",
    label: "ผลประกอบการแต่ละหน่วยงาน",
    needsPeriod: true,
    needsYear: false,
    needsMonth: false,
    filterable: true,
    kind: "site-performance" as const,
    views: ["table", "bar", "pie", "scatter"] as ViewMode[],
    drillable: false,
  },
  // "กำไร/ขาดทุน ค่าเครื่องแบบ" (2026-09-28) — รายได้(ยอดจำหน่าย) -
  // ต้นทุนสินค้า per site, for a calendar year+month (inv_issue_header has
  // no sys_period link — confirmed with the user to filter on DeliveryDate
  // directly, not force a payroll period onto an inventory document).
  {
    key: "uniform-profit",
    label: "กำไร/ขาดทุน ค่าเครื่องแบบ",
    needsPeriod: false,
    needsYear: true,
    needsMonth: true,
    filterable: true,
    kind: "uniform-profit" as const,
    views: ["table", "bar", "pie"] as ViewMode[],
    drillable: false,
  },
  // "หนี้สูญ" (2026-09-29) — outstanding debt of employees who have already
  // resigned. drillable: true, but unlike every other drillable metric the
  // click happens per-ROW (a "ดูรายละเอียด" button in BadDebtTableView), not
  // on a bar/slice — see the isBadDebt render branch below, which skips the
  // usual TableView/BarChartView onSelect wiring and passes its own
  // per-row handler instead. table-only: a per-employee debt amount list
  // has no natural bar/pie/line/scatter reading the way a categorical
  // breakdown does.
  {
    key: "bad-debt",
    label: "หนี้สูญ (พนักงานลาออกแล้ว)",
    needsPeriod: false,
    needsYear: false,
    needsMonth: false,
    filterable: true,
    kind: "bad-debt" as const,
    views: ["table"] as ViewMode[],
    drillable: true,
  },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

export default function DashboardView({
  companies,
  departments,
  sites,
  banks,
  employees,
  periods,
  initialResult,
}: {
  companies: { CompanyCode: string; CompanyName: string }[];
  departments: { DeptCode: string; DeptName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
  banks: { BankCode: string; BankNameTH: string }[];
  employees: { EmpCode: string; FullName: string }[];
  periods: Period[];
  initialResult: DashboardResult;
}) {
  const [metric, setMetric] = useState<MetricKey>("age");
  const [viewMode, setViewMode] = useState<ViewMode>("bar");
  const [employeeType, setEmployeeType] = useState("DAILY");
  const [periodId, setPeriodId] = useState<number | "">("");
  const [year, setYear] = useState(String(toBuddhistYear(new Date().getFullYear())));
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [companyCode, setCompanyCode] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [result, setResult] = useState<DashboardResult | GroupedResult | SitePerformanceResult | UniformProfitResult | BadDebtResult>(initialResult);
  // Tracks which metric `result` actually holds data for — `result`'s shape
  // ({data,unit} vs {groups,series,unit}) depends on the metric's `kind`, and
  // `result` only changes when load() runs (the "แสดงผล" button). Switching
  // `metric` via the dropdown alone does NOT refetch, so without this guard
  // the render below would try to read result.groups/result.series off a
  // stale single-series result (or vice versa) the instant the user picks a
  // metric of a different `kind` — that's exactly the "Cannot read
  // properties of undefined (reading 'length')" crash in GroupedBarChartView.
  const [loadedMetric, setLoadedMetric] = useState<MetricKey>("age");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Drilldown (2026-09-28) — the exact querystring that produced `result`,
  // captured at load() time, is reused verbatim for the drilldown request
  // (just appending bucket/group/series). That way the "which employees"
  // table always matches what's actually on screen even if the viewer has
  // since nudged a filter dropdown without clicking "แสดงผล" again — it
  // never re-reads the live filter state, which could have drifted from
  // what produced the visible chart.
  //
  // Updated 2026-09-28 — clicking a bar/slice/line point/row still selects a
  // bucket the same way as before; only where the result renders changed: it
  // now opens in its own tab ("resultTab") next to the chart/table, instead
  // of being appended inline right under it.
  const [lastQuery, setLastQuery] = useState("");
  const [drilldown, setDrilldown] = useState<DrilldownResult | null>(null);
  const [drilldownTitle, setDrilldownTitle] = useState("");
  const [drilldownPending, setDrilldownPending] = useState(false);
  const [resultTab, setResultTab] = useState<"view" | "drilldown">("view");

  const currentMetric = METRICS.find((m) => m.key === metric)!;
  // "- ทั้งหมด -" (2026-09-29) has no matching sys_period.EmployeeType of
  // its own (every period row is DAILY or MONTHLY, never "all") — show
  // every period unfiltered in that case rather than an empty dropdown.
  const matchingPeriods = employeeType ? periods.filter((p) => p.EmployeeType === employeeType) : periods;

  function selectMetric(key: MetricKey) {
    setMetric(key);
    setMessage(null);
    setDrilldown(null);
    setResultTab("view");
    const next = METRICS.find((m) => m.key === key)!;
    if (next.needsPeriod && periodId === "") {
      const first = periods.find((p) => p.EmployeeType === employeeType);
      if (first) setPeriodId(first.PeriodID);
    }
    if (!next.views.includes(viewMode)) setViewMode(next.views[0]);
  }

  async function load() {
    if (currentMetric.needsPeriod && periodId === "") {
      setMessage("กรุณาเลือกงวดก่อน");
      return;
    }
    if (currentMetric.needsYear && year.trim() === "") {
      setMessage("กรุณาระบุปีก่อน");
      return;
    }
    if (currentMetric.needsMonth && month.trim() === "") {
      setMessage("กรุณาเลือกเดือนก่อน");
      return;
    }
    setMessage(null);
    setDrilldown(null);
    setResultTab("view");
    setPending(true);
    try {
      const params = new URLSearchParams({ metric });
      if (currentMetric.filterable) {
        params.set("employeeType", employeeType);
        if (companyCode) params.set("companyCode", companyCode);
        if (deptCode) params.set("deptCode", deptCode);
        if (siteCode) params.set("siteCode", siteCode);
        if (bankCode) params.set("bankCode", bankCode);
        if (empCode) params.set("empCode", empCode);
      }
      if (currentMetric.needsPeriod && periodId !== "") params.set("periodId", String(periodId));
      if (currentMetric.needsYear && year.trim() !== "") params.set("year", String(toGregorianYear(Number(year))));
      if (currentMetric.needsMonth && month.trim() !== "") params.set("month", month);

      const res = await fetch(`/api/employee-dashboard?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        return;
      }
      // apiSuccess() serializes the result ({data,unit} or {groups,series,unit})
      // as the top-level JSON body directly — no extra "data" wrapper.
      setResult(body as DashboardResult | GroupedResult);
      setLoadedMetric(metric);
      setLastQuery(params.toString());
    } finally {
      setPending(false);
    }
  }

  async function openDrilldown(extra: Record<string, string>, title: string) {
    setMessage(null);
    setDrilldownPending(true);
    setResultTab("drilldown");
    try {
      const params = new URLSearchParams(lastQuery);
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
      const res = await fetch(`/api/employee-dashboard/drilldown?${params.toString()}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(body.message || body.error);
        setDrilldown(null);
        return;
      }
      setDrilldown(body as DrilldownResult);
      setDrilldownTitle(title);
    } finally {
      setDrilldownPending(false);
    }
  }

  const selectCls = "rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900";
  const viewLabels: Record<ViewMode, string> = { table: "ตาราง", pie: "Pie chart", bar: "Bar chart", line: "Line chart", scatter: "Scatter chart" };
  // Render using `result`'s actual metric/shape (loadedMetric), not the
  // dropdown's current selection (metric) — they diverge whenever the user
  // switches metrics without clicking "แสดงผล" yet.
  const dataReady = loadedMetric === metric;
  const loadedMetricDef = METRICS.find((m) => m.key === loadedMetric)!;
  const isGrouped = loadedMetricDef.kind === "grouped";
  const isSitePerformance = loadedMetricDef.kind === "site-performance";
  const isUniformProfit = loadedMetricDef.kind === "uniform-profit";
  const isBadDebt = loadedMetricDef.kind === "bad-debt";
  const canDrill = loadedMetricDef.drillable;

  // Bar/Pie for the two new "kind"s reuse the existing single-series chart
  // components by deriving a plain ChartDatum[] from whichever column is
  // the headline number for that view — see charts.tsx's comment on why
  // these don't get their own bespoke bar/pie renderers. The TRUE signed
  // value is passed through (percent is "กำไร/ขาดทุน(%)" = profit÷revenue,
  // profit is บาท — both can go negative) — BarChartView/PieChartView size
  // the bar/slice by magnitude internally but still display the real
  // signed number, so a loss reads e.g. "-72.1%", not a positive number
  // that looks like a gain.
  const sitePerformanceBarPieData: ChartDatum[] = isSitePerformance
    ? (result as SitePerformanceResult).rows.map((r) => ({ label: r.label, value: r.percent }))
    : [];
  const uniformProfitBarPieData: ChartDatum[] = isUniformProfit ? (result as UniformProfitResult).rows.map((r) => ({ label: r.label, value: r.profit })) : [];
  // Loss = red, profit = green (2026-09-28) — same hex pair already used
  // elsewhere in this app for negative/red (text-red-600) and
  // approve/green (#16a34a) actions.
  function profitLossColorFor(d: ChartDatum) {
    return d.value < 0 ? "#dc2626" : "#16a34a";
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">แสดงข้อมูล</label>
          <select value={metric} onChange={(e) => selectMetric(e.target.value as MetricKey)} className={`${selectCls} w-96`}>
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm text-gray-600">รูปแบบการแสดงผล</label>
          <select value={viewMode} onChange={(e) => setViewMode(e.target.value as ViewMode)} className={`${selectCls} w-40`}>
            {currentMetric.views.map((v) => (
              <option key={v} value={v}>
                {viewLabels[v]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        {currentMetric.filterable && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">ประเภทพนักงาน</label>
            <select
              value={employeeType}
              onChange={(e) => {
                setEmployeeType(e.target.value);
                setPeriodId("");
              }}
              className={selectCls}
            >
              <option value="">- ทั้งหมด -</option>
              <option value="DAILY">รายวัน</option>
              <option value="MONTHLY">รายเดือน</option>
            </select>
          </div>
        )}

        {currentMetric.needsPeriod && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">ประจำงวด</label>
            <select value={periodId} onChange={(e) => setPeriodId(Number(e.target.value))} className={selectCls}>
              <option value="">- เลือกงวด -</option>
              {matchingPeriods.map((p) => (
                <option key={p.PeriodID} value={p.PeriodID}>
                  {p.PeriodMonth}/{toBuddhistYear(p.PeriodYear)} ({p.StartDate.slice(0, 10)} - {p.EndDate.slice(0, 10)})
                </option>
              ))}
            </select>
          </div>
        )}

        {currentMetric.needsYear && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">ปี (พ.ศ.)</label>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className={`${selectCls} w-28`} />
          </div>
        )}

        {currentMetric.needsMonth && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">เดือน</label>
            <select value={month} onChange={(e) => setMonth(e.target.value)} className={selectCls}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        )}

        {currentMetric.filterable && (
          <>
            <div>
              <label className="mb-1 block text-xs text-gray-500">บริษัท</label>
              <select value={companyCode} onChange={(e) => setCompanyCode(e.target.value)} className={selectCls}>
                <option value="">- ทั้งหมด -</option>
                {companies.map((c) => (
                  <option key={c.CompanyCode} value={c.CompanyCode}>
                    {c.CompanyName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">แผนก</label>
              <select value={deptCode} onChange={(e) => setDeptCode(e.target.value)} className={selectCls}>
                <option value="">- ทั้งหมด -</option>
                {departments.map((d) => (
                  <option key={d.DeptCode} value={d.DeptCode}>
                    {d.DeptName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">หน่วยงาน</label>
              <select value={siteCode} onChange={(e) => setSiteCode(e.target.value)} className={selectCls}>
                <option value="">- ทั้งหมด -</option>
                {sites.map((s) => (
                  <option key={s.SiteCode} value={s.SiteCode}>
                    {s.SiteName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">ธนาคาร</label>
              <select value={bankCode} onChange={(e) => setBankCode(e.target.value)} className={selectCls}>
                <option value="">- ทั้งหมด -</option>
                {banks.map((b) => (
                  <option key={b.BankCode} value={b.BankCode}>
                    {b.BankNameTH}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-64">
              <label className="mb-1 block text-xs text-gray-500">รหัสพนักงานเฉพาะราย (ไม่ระบุ = ทุกคน)</label>
              <SearchableSelect
                value={empCode}
                onChange={setEmpCode}
                options={employees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
                placeholder="ค้นหารหัส/ชื่อพนักงาน (เว้นว่าง = ทั้งหมด)"
              />
            </div>
          </>
        )}
        <button onClick={load} disabled={pending} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
          {pending ? "กำลังโหลด..." : "แสดงผล"}
        </button>
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      <div className="rounded border border-gray-200 p-4">
        {!dataReady ? (
          <p className="text-sm text-gray-500">กดปุ่ม &quot;แสดงผล&quot; เพื่อโหลดข้อมูลของรายการที่เลือก</p>
        ) : (
          <>
            {/* Result tabs (2026-09-28) — only shown when this metric supports
                drilldown at all. Clicking any bar/slice/line point/row still
                selects a bucket (same as before), but the result now opens in
                the "รายชื่อพนักงาน" tab here, never as a flyout appended right
                under the chart. */}
            {canDrill && (
              <div className="mb-3 flex gap-1 border-b border-gray-200">
                <button
                  onClick={() => setResultTab("view")}
                  className={`border-b-2 px-3 py-2 text-sm ${
                    resultTab === "view" ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {viewLabels[viewMode]}
                </button>
                <button
                  onClick={() => setResultTab("drilldown")}
                  className={`border-b-2 px-3 py-2 text-sm ${
                    resultTab === "drilldown" ? "border-gray-900 font-medium text-gray-900" : "border-transparent text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {isBadDebt ? "รายละเอียดหนี้" : "รายชื่อพนักงาน"}
                  {drilldown ? ` (${drilldown.rows.length.toLocaleString("th-TH")})` : ""}
                </button>
              </div>
            )}

            {(!canDrill || resultTab === "view") &&
              (isGrouped ? (
                <>
                  {canDrill && <p className="mb-2 text-xs text-gray-500">คลิกที่แถว/แท่งข้อมูล เพื่อดูรายชื่อพนักงานในแท็บ &quot;รายชื่อพนักงาน&quot;</p>}
                  {viewMode === "table" && (
                    <GroupedTableView
                      result={result as GroupedResult}
                      onSelect={canDrill ? (group, series) => openDrilldown({ group, series }, `${group} — ${series}`) : undefined}
                    />
                  )}
                  {viewMode === "bar" && (
                    <GroupedBarChartView
                      result={result as GroupedResult}
                      onSelect={canDrill ? (group, series) => openDrilldown({ group, series }, `${group} — ${series}`) : undefined}
                    />
                  )}
                </>
              ) : isSitePerformance ? (
                <>
                  <p className="mb-2 text-xs text-gray-500">
                    &quot;รายได้พนักงาน&quot; = รายได้รวมก่อนหักภาษี/ประกันสังคม/รายการหักอื่นๆ (ไม่ใช่เงินได้สุทธิ) — Bar/Pie chart แสดงเป็นกำไร/ขาดทุน (%) เทียบรายได้ต่อเดือนของหน่วยงาน
                  </p>
                  {viewMode === "table" && <SitePerformanceTableView result={result as SitePerformanceResult} />}
                  {viewMode === "bar" && <BarChartView data={sitePerformanceBarPieData} unit="%" colorFor={profitLossColorFor} />}
                  {viewMode === "pie" && <PieChartView data={sitePerformanceBarPieData} unit="%" colorFor={profitLossColorFor} />}
                  {viewMode === "scatter" && (
                    <ScatterChartView
                      points={(result as SitePerformanceResult).rows.map((r) => ({ label: r.label, x: r.headcount, y: r.profit }))}
                      xLabel="จำนวนคน"
                      yLabel="กำไร/ขาดทุน (บาท)"
                    />
                  )}
                </>
              ) : isUniformProfit ? (
                <>
                  <p className="mb-2 text-xs text-gray-500">ต้นทุนสินค้าใช้ต้นทุนถัวเฉลี่ยปัจจุบันของสินค้า (ประมาณการ ไม่ใช่ต้นทุน ณ วันที่ขายจริง) — Bar/Pie chart แสดงเป็นมูลค่าสัมบูรณ์ (หน่วยงานที่ขาดทุนจะมีข้อความกำกับ)</p>
                  {viewMode === "table" && <UniformProfitTableView result={result as UniformProfitResult} />}
                  {viewMode === "bar" && <BarChartView data={uniformProfitBarPieData} unit="บาท" colorFor={profitLossColorFor} />}
                  {viewMode === "pie" && <PieChartView data={uniformProfitBarPieData} unit="บาท" colorFor={profitLossColorFor} />}
                </>
              ) : isBadDebt ? (
                <>
                  <p className="mb-2 text-xs text-gray-500">แสดงเฉพาะพนักงานสถานะ &quot;ลาออก&quot; ที่ยังมีหนี้ค้างเปิดอยู่ — คลิก &quot;ดูรายละเอียด&quot; เพื่อดูหนี้แต่ละรายการของคนนั้นในแท็บ &quot;รายละเอียดหนี้&quot;</p>
                  <BadDebtTableView result={result as BadDebtResult} onViewDetail={(code, fullName) => openDrilldown({ empCode: code }, fullName)} />
                </>
              ) : (
                <>
                  {canDrill && <p className="mb-2 text-xs text-gray-500">คลิกที่แถว/แท่งข้อมูล/ชิ้นส่วน เพื่อดูรายชื่อพนักงานในแท็บ &quot;รายชื่อพนักงาน&quot;</p>}
                  {viewMode === "table" && (
                    <TableView data={(result as DashboardResult).data} unit={(result as DashboardResult).unit} onSelect={canDrill ? (label) => openDrilldown({ bucket: label }, label) : undefined} />
                  )}
                  {viewMode === "bar" && (
                    <BarChartView data={(result as DashboardResult).data} unit={(result as DashboardResult).unit} onSelect={canDrill ? (label) => openDrilldown({ bucket: label }, label) : undefined} />
                  )}
                  {viewMode === "pie" && (
                    <PieChartView data={(result as DashboardResult).data} unit={(result as DashboardResult).unit} onSelect={canDrill ? (label) => openDrilldown({ bucket: label }, label) : undefined} />
                  )}
                  {viewMode === "line" && (
                    <LineChartView data={(result as DashboardResult).data} unit={(result as DashboardResult).unit} onSelect={canDrill ? (label) => openDrilldown({ bucket: label }, label) : undefined} />
                  )}
                </>
              ))}

            {canDrill &&
              resultTab === "drilldown" &&
              (drilldownPending ? (
                <p className="text-sm text-gray-500">กำลังโหลดรายชื่อพนักงาน...</p>
              ) : drilldown ? (
                <DrilldownTable
                  result={drilldown}
                  title={drilldownTitle}
                  onClose={() => {
                    setDrilldown(null);
                    setResultTab("view");
                  }}
                />
              ) : (
                <p className="text-sm text-gray-500">
                  {isBadDebt
                    ? 'ยังไม่ได้เลือกรายการ — สลับไปแท็บตาราง แล้วคลิก "ดูรายละเอียด" ที่แถวพนักงานเพื่อดูหนี้ที่นี่'
                    : "ยังไม่ได้เลือกรายการ — สลับไปแท็บตาราง แล้วคลิกที่แถวข้อมูลเพื่อดูรายชื่อพนักงานที่นี่"}
                </p>
              ))}
          </>
        )}
      </div>
    </div>
  );
}
