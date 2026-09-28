import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import { REQUEST_DOCUMENT_DOCTYPE, type RequestDocumentCode } from "@/lib/request";
import RequestDetailView from "./request-detail-view";

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const { id } = await params;
  const requestId = Number(id);
  if (!Number.isInteger(requestId)) notFound();

  const header = await prisma.trnRequestHeader.findUnique({
    where: { RequestHeaderID: requestId },
    include: {
      Details: {
        orderBy: { RequestDetailID: "asc" },
        include: {
          Employee: {
            select: { FullName: true, EmployeeStatus: true, StartDate: true, PositionCode: true, ReferrerEmpCode: true, EmployeeType: true, DailyRate: true, MonthlySalary: true },
          },
          OldPosition: { select: { PositionName: true } },
          NewPosition: { select: { PositionName: true } },
        },
      },
    },
  });
  if (!header) notFound();

  const docType = REQUEST_DOCUMENT_DOCTYPE[header.DocumentCode as RequestDocumentCode];
  const canRead = await hasPermission(user, docType, "read");
  if (!canRead) redirect("/");

  // COMMISSION only — ReferrerEmpCode has no DB-level FK (loose cross-
  // reference, same as elsewhere it's used), so the referrer's name is
  // looked up separately for display ("who actually gets paid").
  let referrerNames: Record<string, string> = {};
  if (header.DocumentCode === "COMMISSION") {
    const referrerCodes = [...new Set(header.Details.map((d) => d.Employee.ReferrerEmpCode).filter((c): c is string => !!c))];
    if (referrerCodes.length > 0) {
      const referrers = await prisma.mstEmployee.findMany({ where: { EmpCode: { in: referrerCodes } }, select: { EmpCode: true, FullName: true } });
      referrerNames = Object.fromEntries(referrers.map((r) => [r.EmpCode, r.FullName]));
    }
  }
  const requestWithReferrer = {
    ...header,
    Details: header.Details.map((d) => ({ ...d, ReferrerName: d.Employee.ReferrerEmpCode ? (referrerNames[d.Employee.ReferrerEmpCode] ?? null) : null })),
  };

  const [canSave, canApprove, employees, positions, blacklist] = await Promise.all([
    hasPermission(user, docType, "save"),
    hasPermission(user, docType, "approve"),
    // PositionCode/Position/EmployeeType/DailyRate/MonthlySalary are only
    // used by the PROMOTE add-row form (shows "ตำแหน่ง/รายได้เดิม" once an
    // employee is picked) — fetched here rather than via
    // /api/employees/[empCode] on selection, which requires EMPLOYEE
    // permission the person filling this form may not have (they only need
    // REQUEST_PROMOTE).
    prisma.mstEmployee.findMany({
      where: { EmployeeStatus: "ACTIVE" },
      orderBy: { EmpCode: "asc" },
      select: { EmpCode: true, FullName: true, PositionCode: true, Position: { select: { PositionName: true } }, EmployeeType: true, DailyRate: true, MonthlySalary: true },
    }),
    prisma.refPosition.findMany({ where: { IsActive: true }, orderBy: { PositionCode: "asc" }, select: { PositionCode: true, PositionName: true } }),
    // RESIGN's "รหัสแบล็คลิส" dropdown — same options/pattern as the
    // Employee Master screen's own BlacklistCode field.
    prisma.refBlackList.findMany({ orderBy: { IDCardNo: "asc" }, select: { IDCardNo: true, FullName: true } }),
  ]);

  return (
    <div className="w-full px-6 py-8">
      <Link href="/requests" className="text-sm text-gray-500 hover:underline">
        ← กลับการขออนุมัติ
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        {header.DocumentCode} {header.DocumentNo ? `#${header.DocumentNo}` : `(คำขอ #${header.RequestHeaderID})`}
      </h1>
      <RequestDetailView
        request={JSON.parse(JSON.stringify(requestWithReferrer))}
        canSave={canSave}
        canApprove={canApprove}
        employees={JSON.parse(JSON.stringify(employees))}
        positions={positions}
        blacklist={blacklist}
      />
    </div>
  );
}
