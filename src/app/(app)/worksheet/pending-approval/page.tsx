import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import WorksheetApprovalTable, { type PendingRow } from "./worksheet-approval-table";

// "รายการรออนุมัติ" ใต้กลุ่ม "ใบลงเวลาปฏิบัติงาน" (2026-09-21) — เหมือนกันกับ
// /inventory/stock-count-approvals และ /requests/draft-list แต่มีแค่
// DocumentType เดียว (WORKSHEET) เลยไม่ต้องมี dropdown กรองประเภทเอกสาร
// ต่างจากทั้งสองหน้านั้น — สโคปตามสิทธิ์ approve บน WORKSHEET แบบแยกรายหน่วยงาน
// (sys_user_permission.SiteCode, เหมือนที่ Worksheet เองใช้อยู่แล้ว): ADMIN
// หรือมีแถวสิทธิ์ SiteCode=NULL เห็นทุกหน่วยงาน, ไม่งั้นเห็นเฉพาะหน่วยงานที่มี
// แถว CanApprove=true ระบุ SiteCode ไว้ตรงๆ.
export default async function WorksheetPendingApprovalPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  let allSites = user.role === "ADMIN";
  let siteCodes: string[] = [];
  if (!allSites) {
    const rows = await prisma.sysUserPermission.findMany({
      where: { UserID: user.userId, DocumentType: "WORKSHEET", CanApprove: true },
      select: { SiteCode: true },
    });
    if (rows.length === 0) redirect("/");
    if (rows.some((r) => r.SiteCode === null)) allSites = true;
    else siteCodes = rows.map((r) => r.SiteCode as string);
  }

  const headers = await prisma.trnWorksheetHeader.findMany({
    where: { Status: "SUBMITTED", ...(allSites ? {} : { SiteCode: { in: siteCodes } }) },
    select: {
      WorksheetID: true,
      SiteCode: true,
      WorkYear: true,
      WorkMonth: true,
      SubmittedBy: true,
      SubmittedDate: true,
      Site: { select: { SiteName: true } },
      _count: { select: { Details: true } },
    },
    orderBy: { SubmittedDate: "asc" },
  });

  const rows: PendingRow[] = headers.map((h) => ({
    worksheetId: h.WorksheetID,
    siteCode: h.SiteCode,
    siteName: h.Site.SiteName,
    workYear: h.WorkYear,
    workMonth: h.WorkMonth,
    employeeCount: h._count.Details,
    submittedBy: h.SubmittedBy,
    submittedDate: h.SubmittedDate ? h.SubmittedDate.toISOString() : null,
  }));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">Worksheet — รายการรออนุมัติ</h1>
      <WorksheetApprovalTable rows={rows} />
    </div>
  );
}
