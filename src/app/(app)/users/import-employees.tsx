"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Swal from "sweetalert2";

interface Candidate {
  empCode: string;
  fullName: string;
  siteCode: string | null;
  company: string | null;
  hasIdCard: boolean;
}

// Opens a panel listing employees that have no login yet; the chosen ones are
// created as Role EMPLOYEE users (UserID = EmpCode, password = ID card number).
export default function ImportEmployees() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Candidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setBusy(true);
    setError(null);
    setPicked(new Set());
    setQ("");
    try {
      const res = await fetch("/api/users/import-employees");
      const body = await res.json();
      if (!res.ok) setError(body.message || body.error || "โหลดรายชื่อไม่สำเร็จ");
      else setList(body);
    } finally {
      setBusy(false);
    }
  }

  const selectable = (e: Candidate) => e.hasIdCard;
  const shown = list.filter((e) => !q.trim() || e.empCode.toLowerCase().includes(q.trim().toLowerCase()) || e.fullName.toLowerCase().includes(q.trim().toLowerCase()));
  const allShownPicked = shown.some(selectable) && shown.filter(selectable).every((e) => picked.has(e.empCode));

  function toggleAll() {
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shown.forEach((e) => next.delete(e.empCode));
      else shown.filter(selectable).forEach((e) => next.add(e.empCode));
      return next;
    });
  }

  async function submit() {
    const confirm = await Swal.fire({
      icon: "question",
      title: `สร้างผู้ใช้งาน ${picked.size} คน?`,
      html: "Role = <b>EMPLOYEE</b> (ใช้เมนู MOBILE)<br/>รหัสผู้ใช้ = รหัสพนักงาน · รหัสผ่านเริ่มต้น = <b>เลขบัตรประชาชน</b>ของพนักงาน",
      showCancelButton: true,
      confirmButtonText: "สร้าง",
      cancelButtonText: "ยกเลิก",
    });
    if (!confirm.isConfirmed) return;
    setBusy(true);
    try {
      const res = await fetch("/api/users/import-employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ empCodes: [...picked] }) });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || body.error || "สร้างไม่สำเร็จ");
        return;
      }
      await Swal.fire({ icon: "success", title: "สำเร็จ", text: `สร้างผู้ใช้งานแล้ว ${body.created} คน${body.skipped ? ` (ข้าม ${body.skipped})` : ""}` });
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={openPanel} className="rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50">
        นำเข้าจากทะเบียนพนักงาน
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="font-semibold text-gray-900">นำเข้าผู้ใช้งานจากทะเบียนพนักงาน</h2>
              <p className="mt-1 text-xs text-gray-500">แสดงเฉพาะพนักงานที่ยังใช้งานอยู่และยังไม่มีบัญชีผู้ใช้ — สร้างเป็น Role EMPLOYEE รหัสผ่านเริ่มต้นคือเลขบัตรประชาชนของพนักงาน ใช้เมนู MOBILE (พนักงานที่ไม่มีเลขบัตรเลือกไม่ได้ — ต้องกรอกที่ทะเบียนพนักงานก่อน)</p>
              <input className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm" placeholder="ค้นหารหัส/ชื่อพนักงาน" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {busy && list.length === 0 ? (
                <p className="p-5 text-sm text-gray-500">กำลังโหลด...</p>
              ) : list.length === 0 ? (
                <p className="p-5 text-sm text-gray-500">ไม่มีพนักงานที่ต้องนำเข้า (ทุกคนมีบัญชีแล้ว)</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="w-10 px-4 py-2">
                        <input type="checkbox" checked={allShownPicked} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
                      </th>
                      <th className="px-2 py-2">รหัสพนักงาน</th>
                      <th className="px-2 py-2">ชื่อ</th>
                      <th className="px-2 py-2">บริษัท</th>
                      <th className="px-2 py-2">หน่วยงาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={e.empCode} className="border-t border-gray-100 hover:bg-purple-50">
                        <td className="px-4 py-1.5">
                          <input
                            type="checkbox"
                            disabled={!e.hasIdCard}
                            checked={picked.has(e.empCode)}
                            onChange={(ev) =>
                              setPicked((prev) => {
                                const next = new Set(prev);
                                if (ev.target.checked) next.add(e.empCode);
                                else next.delete(e.empCode);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5 text-gray-900">{e.empCode}</td>
                        <td className="px-2 py-1.5">
                          {e.fullName}
                          {!e.hasIdCard && <span className="ml-2 text-xs text-red-600">ไม่มีเลขบัตรประชาชน</span>}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">{e.company ?? "-"}</td>
                        <td className="px-2 py-1.5 text-gray-500">{e.siteCode ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {error && <p className="mx-5 mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3">
              <span className="text-sm text-gray-500">เลือกแล้ว {picked.size} คน</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700">
                  ปิด
                </button>
                <button type="button" onClick={submit} disabled={busy || picked.size === 0} className="rounded bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40">
                  สร้างผู้ใช้งาน
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
