"use client";

import { useState } from "react";
import { toBuddhistYear } from "@/lib/buddhist-year";
import SearchableSelect from "../../searchable-select";
import { TableView, BarChartView, PieChartView, LineChartView, GroupedTableView, GroupedBarChartView } from "./charts";
import type { ChartDatum, GroupedResult } from "@/lib/reports/dashboard-data";

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
type ViewMode = "table" | "pie" | "bar" | "line";
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
const METRICS = [
  { key: "age", label: "อายุพนักงาน (จำนวนคนต่อช่วงอายุ)", needsPeriod: false, filterable: true, kind: "single" as const, views: ALL_VIEWS },
  { key: "headcount-by-site", label: "จำนวนคนในหน่วยงาน (Site)", needsPeriod: false, filterable: true, kind: "single" as const, views: ALL_VIEWS },
  { key: "cost-by-site", label: "ค่าใช้จ่ายรวมตามหน่วยงาน (% เทียบทั้งหมด)", needsPeriod: true, filterable: true, kind: "single" as const, views: ALL_VIEWS },
  {
    key: "stock-value-monthly",
    label: "มูลค่าสต๊อกสินค้า รายเดือน (ประมาณการ)",
    needsPeriod: false,
    filterable: false,
    kind: "single" as const,
    views: ["table", "bar"] as ViewMode[],
  },
  {
    key: "welfare-value-monthly",
    label: "มูลค่าสินค้าสวัสดิการที่เสียไป (ของฟรี) รายเดือน (ประมาณการ)",
    needsPeriod: false,
    filterable: false,
    kind: "single" as const,
    views: ["table", "bar"] as ViewMode[],
  },
  { key: "gender-by-site", label: "สัดส่วนเพศ ตามหน่วยงาน", needsPeriod: false, filterable: true, kind: "grouped" as const, views: ["table", "bar"] as ViewMode[] },
  { key: "age-by-site", label: "สัดส่วนช่วงอายุ ตามหน่วยงาน", needsPeriod: false, filterable: true, kind: "grouped" as const, views: ["table", "bar"] as ViewMode[] },
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
  const [companyCode, setCompanyCode] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  const [result, setResult] = useState<DashboardResult | GroupedResult>(initialResult);
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

  const currentMetric = METRICS.find((m) => m.key === metric)!;
  const matchingPeriods = periods.filter((p) => p.EmployeeType === employeeType);

  function selectMetric(key: MetricKey) {
    setMetric(key);
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
    setMessage(null);
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
    } finally {
      setPending(false);
    }
  }

  const selectCls = "rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900";
  const viewLabels: Record<ViewMode, string> = { table: "ตาราง", pie: "Pie chart", bar: "Bar chart", line: "Line chart" };
  // Render using `result`'s actual metric/shape (loadedMetric), not the
  // dropdown's current selection (metric) — they diverge whenever the user
  // switches metrics without clicking "แสดงผล" yet.
  const dataReady = loadedMetric === metric;
  const isGrouped = METRICS.find((m) => m.key === loadedMetric)!.kind === "grouped";

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
        ) : isGrouped ? (
          <>
            {viewMode === "table" && <GroupedTableView result={result as GroupedResult} />}
            {viewMode === "bar" && <GroupedBarChartView result={result as GroupedResult} />}
          </>
        ) : (
          <>
            {viewMode === "table" && <TableView data={(result as DashboardResult).data} unit={result.unit} />}
            {viewMode === "bar" && <BarChartView data={(result as DashboardResult).data} unit={result.unit} />}
            {viewMode === "pie" && <PieChartView data={(result as DashboardResult).data} unit={result.unit} />}
            {viewMode === "line" && <LineChartView data={(result as DashboardResult).data} unit={result.unit} />}
          </>
        )}
      </div>
    </div>
  );
}
