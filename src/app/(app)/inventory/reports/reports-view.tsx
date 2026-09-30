"use client";

import { useState } from "react";
import SearchableSelect from "../../searchable-select";

// Which filters each report uses. "employee" = company/site/employee
// filters (the employee-linked reports only). dates: "required" | "optional"
// | none. warehouse/product "required" matters for Stock Card only.
interface ReportDef {
  key: string;
  label: string;
  apiBase: string; // most go to the inventory route; หนี้ค้างค่าชุด is served by the payroll debt-report route
  dates: "required" | "optional" | "none";
  warehouse: "required" | "optional";
  product: "required" | "optional" | "none";
  category: boolean;
  employee: boolean;
}
const REPORTS: ReportDef[] = [
  { key: "stock-balance", label: "สต๊อกคงเหลือ", apiBase: "/api/inventory/reports", dates: "none", warehouse: "optional", product: "optional", category: true, employee: false },
  { key: "stock-card", label: "Stock Card", apiBase: "/api/inventory/reports", dates: "required", warehouse: "required", product: "required", category: false, employee: false },
  { key: "welfare", label: "สินค้าสวัสดิการ", apiBase: "/api/inventory/reports", dates: "optional", warehouse: "optional", product: "optional", category: true, employee: true },
  { key: "sale-return", label: "สรุปการขาย-รับคืน", apiBase: "/api/inventory/reports", dates: "optional", warehouse: "optional", product: "optional", category: true, employee: true },
  { key: "movement-summary", label: "สรุปความเคลื่อนไหว", apiBase: "/api/inventory/reports", dates: "required", warehouse: "optional", product: "optional", category: true, employee: false },
  { key: "debt-uniform", label: "หนี้ค้างค่าชุด", apiBase: "/api/payroll/reports", dates: "none", warehouse: "optional", product: "none", category: false, employee: true },
];

const selectCls = "rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900";

export default function InventoryReportsView({
  warehouses,
  categories,
  products,
  companies,
  sites,
  employees,
}: {
  warehouses: { WarehouseCode: string; WarehouseName: string }[];
  categories: { CategoryCode: string; CategoryName: string }[];
  products: { ProductCode: string; ProductName: string }[];
  companies: { CompanyCode: string; CompanyName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
  employees: { EmpCode: string; FullName: string }[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const [reportKey, setReportKey] = useState(REPORTS[0].key);
  const [warehouseCode, setWarehouseCode] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [productCode, setProductCode] = useState("");
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [companyCode, setCompanyCode] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [empCode, setEmpCode] = useState("");
  // หนี้ค้างค่าชุด only: how rows are laid out — "EMP" = one flat list ordered
  // by รหัสพนักงาน, "SITE" = grouped by หน่วยงาน (with a subtotal per site),
  // employees ordered by รหัสพนักงาน inside each group.
  const [displayMode, setDisplayMode] = useState<"EMP" | "SITE">("EMP");
  const [pending, setPending] = useState<"pdf" | "excel" | "preview" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  const report = REPORTS.find((r) => r.key === reportKey)!;

  async function fetchReportBlob(format: "pdf" | "excel"): Promise<Blob | null> {
    setMessage(null);
    if (report.warehouse === "required" && !warehouseCode) {
      setMessage("กรุณาเลือกคลัง");
      return null;
    }
    if (report.product === "required" && !productCode) {
      setMessage("กรุณาเลือกสินค้า");
      return null;
    }
    if (report.dates === "required" && (!startDate || !endDate)) {
      setMessage("กรุณาระบุช่วงวันที่");
      return null;
    }
    const params = new URLSearchParams({ format });
    // หนี้ค้างค่าชุด's payroll route has no warehouse/category/product/date filters.
    if (report.apiBase === "/api/inventory/reports") {
      if (warehouseCode) params.set("warehouseCode", warehouseCode);
      if (report.category && categoryCode) params.set("categoryCode", categoryCode);
      if (report.product !== "none" && productCode) params.set("productCode", productCode);
      if (report.dates !== "none" && startDate && endDate) {
        params.set("startDate", startDate);
        params.set("endDate", endDate);
      }
    }
    if (report.employee) {
      if (companyCode) params.set("companyCode", companyCode);
      if (siteCode) params.set("siteCode", siteCode);
      if (empCode) params.set("empCode", empCode);
    }
    if (report.key === "debt-uniform") {
      params.set("sortBy", "empCode");
      params.set("sortDir", "asc");
      if (displayMode === "SITE") params.set("groupBy", "SITE");
    }
    const res = await fetch(`${report.apiBase}/${report.key}?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.message || body.error || "สร้างรายงานไม่สำเร็จ");
      return null;
    }
    return res.blob();
  }

  function downloadBlob(blob: Blob, format: "pdf" | "excel") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.key}.${format === "pdf" ? "pdf" : "xlsx"}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function generate(format: "pdf" | "excel") {
    setPending(format);
    try {
      const blob = await fetchReportBlob(format);
      if (blob) downloadBlob(blob, format);
    } finally {
      setPending(null);
    }
  }

  async function openPreview() {
    setPending("preview");
    try {
      const blob = await fetchReportBlob("pdf");
      if (blob) {
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
        setPreviewBlob(blob);
      }
    } finally {
      setPending(null);
    }
  }

  function closePreview() {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreviewBlob(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        <div>
          <label className="mb-1 block text-sm text-gray-600">ประเภทรายงาน</label>
          <select value={reportKey} onChange={(e) => setReportKey(e.target.value)} className={selectCls}>
            {REPORTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded border border-gray-200 p-3">
        {report.apiBase === "/api/inventory/reports" && (
          <div>
            <label className="mb-1 block text-sm text-gray-600">คลัง{report.warehouse === "required" ? " *" : ""}</label>
            <select value={warehouseCode} onChange={(e) => setWarehouseCode(e.target.value)} className={selectCls}>
              <option value="">{report.warehouse === "required" ? "- เลือกคลัง -" : "- ทุกคลัง -"}</option>
              {warehouses.map((w) => (
                <option key={w.WarehouseCode} value={w.WarehouseCode}>
                  {w.WarehouseCode} {w.WarehouseName}
                </option>
              ))}
            </select>
          </div>
        )}
        {report.category && (
          <div>
            <label className="mb-1 block text-sm text-gray-600">หมวดหมู่</label>
            <select value={categoryCode} onChange={(e) => setCategoryCode(e.target.value)} className={selectCls}>
              <option value="">- ทุกหมวด -</option>
              {categories.map((c) => (
                <option key={c.CategoryCode} value={c.CategoryCode}>
                  {c.CategoryName}
                </option>
              ))}
            </select>
          </div>
        )}
        {report.product !== "none" && (
          <div className="min-w-64">
            <label className="mb-1 block text-sm text-gray-600">สินค้า{report.product === "required" ? " *" : ""}</label>
            <SearchableSelect
              value={productCode}
              onChange={setProductCode}
              options={products.map((p) => ({ code: p.ProductCode, label: `${p.ProductCode} — ${p.ProductName}` }))}
              placeholder={report.product === "required" ? "ค้นหารหัส/ชื่อสินค้า" : "ทุกสินค้า (ค้นหารหัส/ชื่อ)"}
            />
          </div>
        )}
        {report.dates !== "none" && (
          <>
            <div>
              <label className="mb-1 block text-sm text-gray-600">ตั้งแต่วันที่{report.dates === "required" ? " *" : ""}</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={selectCls} />
            </div>
            <div>
              <label className="mb-1 block text-sm text-gray-600">ถึงวันที่{report.dates === "required" ? " *" : ""}</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={selectCls} />
            </div>
          </>
        )}
        {report.employee && (
          <>
            <div>
              <label className="mb-1 block text-sm text-gray-600">บริษัท</label>
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
              <label className="mb-1 block text-sm text-gray-600">หน่วยงาน</label>
              <select value={siteCode} onChange={(e) => setSiteCode(e.target.value)} className={selectCls}>
                <option value="">- ทั้งหมด -</option>
                {sites.map((s) => (
                  <option key={s.SiteCode} value={s.SiteCode}>
                    {s.SiteName}
                  </option>
                ))}
              </select>
            </div>
            {report.key === "debt-uniform" && (
              <div>
                <label className="mb-1 block text-sm text-gray-600">การแสดงผล</label>
                <select value={displayMode} onChange={(e) => setDisplayMode(e.target.value as "EMP" | "SITE")} className={selectCls}>
                  <option value="EMP">เรียงตามรหัสพนักงาน</option>
                  <option value="SITE">หน่วยงาน / รหัสพนักงาน</option>
                </select>
              </div>
            )}
            <div className="min-w-64">
              <label className="mb-1 block text-sm text-gray-600">พนักงานเฉพาะราย (ไม่ระบุ = ทุกคน)</label>
              <SearchableSelect
                value={empCode}
                onChange={setEmpCode}
                options={employees.map((e) => ({ code: e.EmpCode, label: `${e.EmpCode} — ${e.FullName}` }))}
                placeholder="ค้นหารหัส/ชื่อพนักงาน"
              />
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={openPreview} disabled={pending !== null} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
          {pending === "preview" ? "กำลังโหลด..." : "ดูตัวอย่าง (Preview)"}
        </button>
        <button onClick={() => generate("pdf")} disabled={pending !== null} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {pending === "pdf" ? "กำลังสร้าง..." : "ออกรายงาน PDF"}
        </button>
        <button onClick={() => generate("excel")} disabled={pending !== null} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {pending === "excel" ? "กำลังสร้าง..." : "ส่งออก Excel"}
        </button>
      </div>

      {message && <p className="text-sm text-red-600">{message}</p>}

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-medium text-gray-900">ตัวอย่างรายงาน: {report.label}</h2>
              <div className="flex items-center gap-2">
                <button onClick={() => previewBlob && downloadBlob(previewBlob, "pdf")} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
                  ดาวน์โหลด PDF
                </button>
                <button onClick={() => generate("excel")} disabled={pending !== null} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {pending === "excel" ? "กำลังสร้าง..." : "ส่งออก Excel"}
                </button>
                <button onClick={closePreview} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  ปิด
                </button>
              </div>
            </div>
            <iframe src={previewUrl} title="report-preview" className="min-h-0 flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}
