import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { hasPermission, requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { REQUEST_DOCUMENT_CODE_VALUES, REQUEST_DOCUMENT_DOCTYPE, isValidRequestDocumentCode } from "@/lib/request";

// BR-019: "Draft List" is really the approver's pending-approval queue —
// every SUBMITTED request across all document codes the user has read
// access to, not actually limited to DRAFT-status rows despite the name.
// Filters added 2026-09-19: documentCode, and a date range over RequestDate.
export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "DRAFT_LIST", "read");
  if (denied) return denied;

  const documentCodeParam = request.nextUrl.searchParams.get("documentCode");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  const visibleCodes = (
    await Promise.all(REQUEST_DOCUMENT_CODE_VALUES.map(async (c) => ((await hasPermission(user, REQUEST_DOCUMENT_DOCTYPE[c], "read")) ? c : null)))
  ).filter((c): c is (typeof REQUEST_DOCUMENT_CODE_VALUES)[number] => c !== null);

  if (visibleCodes.length === 0) return apiSuccess([]);

  let documentCodes: string[] = visibleCodes;
  if (documentCodeParam) {
    if (!isValidRequestDocumentCode(documentCodeParam) || !visibleCodes.includes(documentCodeParam)) {
      return apiSuccess([]);
    }
    documentCodes = [documentCodeParam];
  }

  const where: { Status: string; DocumentCode: { in: string[] }; RequestDate?: { gte?: Date; lte?: Date } } = {
    Status: "SUBMITTED",
    DocumentCode: { in: documentCodes },
  };
  if (from || to) {
    where.RequestDate = {};
    if (from) where.RequestDate.gte = new Date(`${from}T00:00:00`);
    if (to) where.RequestDate.lte = new Date(`${to}T23:59:59`);
  }

  const rows = await prisma.trnRequestHeader.findMany({
    where,
    include: { Details: true },
    orderBy: { SubmittedDate: "asc" },
  });
  return apiSuccess(rows);
}
