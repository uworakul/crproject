"use client";

import Link from "next/link";
import { useState } from "react";

interface EmployeeRow {
  EmpCode: string;
  FullName: string;
  EmployeeStatus: string;
  EmployeeType: string;
  DeptCode: string | null;
  DeptName: string | null;
  PositionName: string | null;
  SiteCode: string | null;
  SiteName: string | null;
  IsActive: boolean;
}

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm";

export default function EmployeesTable({
  employees,
  departments,
  sites,
}: {
  employees: EmployeeRow[];
  departments: { DeptCode: string; DeptName: string }[];
  sites: { SiteCode: string; SiteName: string }[];
}) {
  const [deptCode, setDeptCode] = useState("");
  const [siteCode, setSiteCode] = useState("");
  const [nameQuery, setNameQuery] = useState("");

  const filtered = employees.filter((e) => {
    if (deptCode && e.DeptCode !== deptCode) return false;
    if (siteCode && e.SiteCode !== siteCode) return false;
    if (nameQuery && !e.FullName.toLowerCase().includes(nameQuery.toLowerCase()) && !e.EmpCode.toLowerCase().includes(nameQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select value={deptCode} onChange={(e) => setDeptCode(e.target.value)} className={inputCls}>
          <option value="">- ทุกแผนก -</option>
          {departments.map((d) => (
            <option key={d.DeptCode} value={d.DeptCode}>
              {d.DeptName}
            </option>
          ))}
        </select>
        <select value={siteCode} onChange={(e) => setSiteCode(e.target.value)} className={inputCls}>
          <option value="">- ทุกหน่วยงาน -</option>
          {sites.map((s) => (
            <option key={s.SiteCode} value={s.SiteCode}>
              {s.SiteName}
            </option>
          ))}
        </select>
        <input
          value={nameQuery}
          onChange={(e) => setNameQuery(e.target.value)}
          placeholder="ค้นหาชื่อหรือรหัสพนักงาน..."
          className={`${inputCls} min-w-56`}
        />
        <span className="text-sm text-gray-400">{filtered.length} รายการ</span>
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-gray-200 bg-white text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">รหัส</th>
            <th className="px-3 py-2 font-medium">ชื่อ-นามสกุล</th>
            <th className="px-3 py-2 font-medium">แผนก</th>
            <th className="px-3 py-2 font-medium">ตำแหน่ง</th>
            <th className="px-3 py-2 font-medium">หน่วยงาน</th>
            <th className="px-3 py-2 font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((e) => (
            <tr key={e.EmpCode} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-3 py-2">
                <Link href={`/employees/${e.EmpCode}`} className="text-gray-900 hover:underline">
                  {e.EmpCode}
                </Link>
              </td>
              <td className="px-3 py-2">{e.FullName}</td>
              <td className="px-3 py-2 text-gray-500">{e.DeptName ?? "-"}</td>
              <td className="px-3 py-2 text-gray-500">{e.PositionName ?? "-"}</td>
              <td className="px-3 py-2 text-gray-500">{e.SiteName ?? "-"}</td>
              <td className="px-3 py-2">
                {e.EmployeeStatus === "RESIGNED" ? (
                  <span className="text-gray-400">ลาออกแล้ว</span>
                ) : e.IsActive ? (
                  <span className="text-green-600">ทำงานอยู่</span>
                ) : (
                  <span className="text-red-500">ระงับ</span>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                ไม่พบพนักงานตามเงื่อนไขที่เลือก
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
