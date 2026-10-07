import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { readableSiteScope, getAttendanceRows } from "@/lib/attendance-report";
import { employeeScopeWhere } from "@/lib/employee-scope";
import EmployeeFilter from "./employee-filter";

const inputCls = "rounded border border-gray-300 px-3 py-1.5 text-sm";
const bkk = (d: Date) => d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const bkkTime = (d: Date) => d.toLocaleTimeString("th-TH", { hour12: false, timeZone: "Asia/Bangkok" });
const todayBkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

function Photo({ id, type, has }: { id: number; type: "IN" | "OUT"; has: boolean }) {
  if (!has) return <span className="text-gray-400">-</span>;
  const src = `/api/attendance-photo?id=${id}&type=${type}`;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={type === "IN" ? "รูปเข้างาน" : "รูปเลิกงาน"} loading="lazy" className="h-16 w-16 rounded object-cover" />
    </a>
  );
}

export default async function AttendanceReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const scope = await readableSiteScope(user);
  if (!scope) redirect("/");

  const sp = await searchParams;
  const today = todayBkk();
  const from = isDay(sp.from) ? sp.from : today;
  const to = isDay(sp.to) ? sp.to : today;
  const siteCode = sp.site || undefined;
  const empCode = sp.emp?.trim() || undefined;

  const [sites, employees, rows] = await Promise.all([
    prisma.mstSite.findMany({ where: { IsActive: true, ...(scope.all ? {} : { SiteCode: { in: scope.siteCodes } }) }, orderBy: { SiteCode: "asc" } }),
    prisma.mstEmployee.findMany({ where: employeeScopeWhere(user), select: { EmpCode: true, FullName: true }, orderBy: { EmpCode: "asc" } }),
    getAttendanceRows(user, scope, { siteCode, from, to, empCode }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">รายงานการลงเวลางาน</h1>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">
          หน่วยงาน
          <select name="site" defaultValue={siteCode ?? ""} className={`${inputCls} mt-1 block`}>
            <option value="">ทั้งหมด</option>
            {sites.map((s) => (
              <option key={s.SiteCode} value={s.SiteCode}>
                {s.SiteCode} — {s.SiteName}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-700">
          วันที่เริ่มต้น
          <input type="date" name="from" defaultValue={from} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-sm text-gray-700">
          วันที่สิ้นสุด
          <input type="date" name="to" defaultValue={to} className={`${inputCls} mt-1 block`} />
        </label>
        <div className="text-sm text-gray-700">
          <div className="mb-1">รหัสพนักงาน (ไม่ระบุ = ทุกคน)</div>
          <EmployeeFilter employees={employees.map((e) => ({ code: e.EmpCode, name: e.FullName }))} initial={empCode ?? ""} />
        </div>
        <button type="submit" className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white">
          ค้นหา
        </button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2">ลำดับที่</th>
              <th className="px-3 py-2">รหัสพนักงาน</th>
              <th className="px-3 py-2">ชื่อ</th>
              <th className="px-3 py-2">หน่วยงาน</th>
              <th className="px-3 py-2">วันที่เข้างาน</th>
              <th className="px-3 py-2">เวลาเข้างาน</th>
              <th className="px-3 py-2">วันที่ออกงาน</th>
              <th className="px-3 py-2">เวลาออกงาน</th>
              <th className="px-3 py-2">รูปเข้างาน</th>
              <th className="px-3 py-2">รูปเลิกงาน</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-gray-500">
                  ไม่พบข้อมูล
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.AttendanceID} className="hover:bg-purple-50">
                <td className="px-3 py-2">{i + 1}</td>
                <td className="px-3 py-2">{r.EmpCode}</td>
                <td className="px-3 py-2">{r.Employee.FullName}</td>
                <td className="px-3 py-2">{r.Site.SiteName}</td>
                <td className="px-3 py-2">{bkk(r.CheckInTime)}</td>
                <td className="px-3 py-2">{bkkTime(r.CheckInTime)}</td>
                <td className="px-3 py-2">{r.CheckOutTime ? bkk(r.CheckOutTime) : "-"}</td>
                <td className="px-3 py-2">{r.CheckOutTime ? bkkTime(r.CheckOutTime) : "-"}</td>
                <td className="px-3 py-2">
                  <Photo id={r.AttendanceID} type="IN" has={!!r.CheckInPhoto} />
                </td>
                <td className="px-3 py-2">
                  <Photo id={r.AttendanceID} type="OUT" has={!!r.CheckOutPhoto} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length >= 1000 && <p className="mt-2 text-xs text-gray-500">แสดงสูงสุด 1,000 รายการ — กรุณาจำกัดช่วงวันที่/หน่วยงาน</p>}
    </div>
  );
}
