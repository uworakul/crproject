"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Employee {
  EmpCode: string;
  LicenseNo7: string | null;
  LicenseDate7: string | null;
  Tbor7Topic1: boolean | null;
  Tbor7Topic2: boolean | null;
  Tbor7Topic3: boolean | null;
  Tbor7Topic4: boolean | null;
  Tbor7Topic5: boolean | null;
  Tbor7Topic6: boolean | null;
  Tbor7Topic7: boolean | null;
  Tbor7Topic8: boolean | null;
  Tbor7Topic9: boolean | null;
  Tbor7Topic10: boolean | null;
  Tbor7Remark: string | null;
}

// 10 หัวข้อหลักสูตรตาม พ.ร.บ.ธุรกิจรักษาความปลอดภัย (แบบ ธภ.7) — รายการ/
// จำนวนชั่วโมงตามที่ผู้ใช้ระบุตรงๆ (2026-09-22), เก็บเป็น checkbox อิสระต่อ
// หัวข้อบน mst_employee (ดูเหตุผลใน schema.prisma) ไม่ใช่ progress bar หรือ
// เปอร์เซ็นต์รวม — แต่ละหัวข้อผ่าน/ไม่ผ่านแยกจากกัน
const TOPICS: { key: keyof Employee; label: string }[] = [
  { key: "Tbor7Topic1", label: "ความรู้เบื้องต้นเกี่ยวกับธุรกิจรักษาความปลอดภัย (ทฤษฎี 2 ชั่วโมง)" },
  { key: "Tbor7Topic2", label: "กฎหมายที่เกี่ยวข้องกับการรักษาความปลอดภัย (ทฤษฎี 2 ชั่วโมง)" },
  { key: "Tbor7Topic3", label: "การรักษาความปลอดภัยขั้นพื้นฐาน (ทฤษฎี 3 ชั่วโมง ปฏิบัติ 4 ชั่วโมง)" },
  { key: "Tbor7Topic4", label: "การเขียนรายงาน (ทฤษฎี 1 ชั่วโมง ปฏิบัติ 1 ชั่วโมง)" },
  { key: "Tbor7Topic5", label: "การเตรียมพร้อมกรณีเหตุฉุกเฉิน (ทฤษฎี 2 ชั่วโมง ปฏิบัติ 3 ชั่วโมง)" },
  { key: "Tbor7Topic6", label: "การติดต่อสื่อสาร (ทฤษฎี 1 ชั่วโมง ปฏิบัติ 1 ชั่วโมง)" },
  { key: "Tbor7Topic7", label: "หลักการใช้กำลัง (ทฤษฎี 2 ชั่วโมง ปฏิบัติ 2 ชั่วโมง)" },
  { key: "Tbor7Topic8", label: "การปฐมพยาบาลเบื้องต้น (ทฤษฎี 2 ชั่วโมง ปฏิบัติ 2 ชั่วโมง)" },
  { key: "Tbor7Topic9", label: "การจัดการจราจร (ทฤษฎี 1 ชั่วโมง ปฏิบัติ 2 ชั่วโมง)" },
  { key: "Tbor7Topic10", label: "การฝึกภาคสนาม (ปฏิบัติ 9 ชั่วโมง)" },
];

function toDateInputValue(value: string | null): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export default function Tbor7ChecklistTab({ employee, canSave }: { employee: Employee; canSave: boolean }) {
  const router = useRouter();
  const [licenseNo7, setLicenseNo7] = useState(employee.LicenseNo7 ?? "");
  const [licenseDate7, setLicenseDate7] = useState(toDateInputValue(employee.LicenseDate7));
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(TOPICS.map((t) => [t.key, Boolean(employee[t.key])])),
  );
  const [remark, setRemark] = useState(employee.Tbor7Remark ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function save() {
    setMessage(null);
    setPending(true);
    try {
      const body: Record<string, boolean | string> = { tbor7Remark: remark, licenseNo7, licenseDate7 };
      for (const t of TOPICS) body[`tbor7${String(t.key).slice(5)}`] = checked[t.key];
      const res = await fetch(`/api/employees/${employee.EmpCode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const resBody = await res.json().catch(() => ({}));
      setMessage(res.ok ? "บันทึกแล้ว" : resBody.message || resBody.error);
      if (res.ok) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-gray-400">แบบ ธภ.7 — บันทึกผลการฝึกอบรมตามหลักสูตรที่กฎหมายกำหนด</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">เลขที่ใบอนุญาต ธภ.7</span>
          <input
            disabled={!canSave}
            value={licenseNo7}
            onChange={(e) => setLicenseNo7(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-600">ลงวันที่ ธภ.7</span>
          <input
            disabled={!canSave}
            type="date"
            value={licenseDate7}
            onChange={(e) => setLicenseDate7(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
          />
        </label>
      </div>
      <div className="flex flex-col gap-2">
        {TOPICS.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              disabled={!canSave}
              checked={checked[t.key] ?? false}
              onChange={(e) => setChecked({ ...checked, [t.key]: e.target.checked })}
              className="h-4 w-4"
            />
            {t.label}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-gray-600">หมายเหตุ</span>
        <input
          disabled={!canSave}
          type="text"
          value={remark}
          onChange={(e) => setRemark(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
        />
      </label>

      {canSave && (
        <div>
          <button onClick={save} disabled={pending} className="rounded-md bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50">
            {pending ? "กำลังบันทึก..." : "บันทึก"}
          </button>
        </div>
      )}

      {message && <p className="text-sm text-gray-600">{message}</p>}
    </div>
  );
}
