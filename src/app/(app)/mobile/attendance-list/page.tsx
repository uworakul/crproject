import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { bangkokDayRange } from "@/lib/attendance-report";

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm";
const fmtDate = (d: Date) => d.toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" });
const fmtTime = (d: Date) => d.toLocaleTimeString("th-TH", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).replace(":", ".");
const todayBkk = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
const isDay = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

// MOBILE: the logged-in employee's own check-in/out records, filtered only by
// a start-end date range (Bangkok calendar days, by check-in time).
export default async function AttendanceListPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await verifySession();
  if (!user) redirect("/login");
  const me = await requireSelfEmployee(user);
  if ("error" in me) redirect("/");

  const sp = await searchParams;
  const today = todayBkk();
  const from = isDay(sp.from) ? sp.from : today.slice(0, 8) + "01";
  const to = isDay(sp.to) ? sp.to : today;

  const rows = await prisma.trnAttendanceLog.findMany({
    where: { EmpCode: me.employee.EmpCode, CheckInTime: bangkokDayRange(from, to) },
    include: { Site: { select: { SiteName: true } } },
    orderBy: { CheckInTime: "desc" },
    take: 500,
  });

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-6">
      <h1 className="text-xl font-semibold text-gray-900">รายการลงเวลางาน</h1>
      <p className="mt-1 text-sm text-gray-500">
        {me.employee.FullName} ({me.employee.EmpCode})
      </p>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-sm text-gray-700">
          วันที่เริ่มต้น
          <input type="date" name="from" defaultValue={from} className={`${inputCls} mt-1 block`} />
        </label>
        <label className="text-sm text-gray-700">
          วันที่สิ้นสุด
          <input type="date" name="to" defaultValue={to} className={`${inputCls} mt-1 block`} />
        </label>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          ค้นหา
        </button>
      </form>
      <div className="mt-4 space-y-2">
        {rows.length === 0 && <p className="rounded border border-gray-200 bg-white p-4 text-center text-sm text-gray-500">ไม่พบข้อมูล</p>}
        {rows.map((r) => (
          <div key={r.AttendanceID} className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
            <div className="font-medium text-gray-900">{r.Site.SiteName}</div>
            <div className="mt-1 text-gray-700">
              เข้างาน: {fmtDate(r.CheckInTime)} {fmtTime(r.CheckInTime)}
            </div>
            <div className="text-gray-700">เลิกงาน: {r.CheckOutTime ? `${fmtDate(r.CheckOutTime)} ${fmtTime(r.CheckOutTime)}` : "ยังไม่ได้ Check-out"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
