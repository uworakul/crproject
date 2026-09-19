import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isValidRequestDocumentCode, REQUEST_DOCUMENT_DOCTYPE } from "@/lib/request";
import { consumeDocumentNumber } from "@/lib/document-number";

export async function GET(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const docType = request.nextUrl.searchParams.get("docType");
  if (!docType || !["REQUEST_ADVANCE", "REQUEST_LOAN", "REQUEST_TRAINING"].includes(docType)) {
    return apiError(400, "INVALID_PARAMS", "docType must be REQUEST_ADVANCE, REQUEST_LOAN, or REQUEST_TRAINING");
  }

  const denied = await requirePermission(user, docType, "read");
  if (denied) return denied;

  const documentCodes = Object.entries(REQUEST_DOCUMENT_DOCTYPE)
    .filter(([, dt]) => dt === docType)
    .map(([code]) => code);

  const headers = await prisma.trnRequestHeader.findMany({
    where: { DocumentCode: { in: documentCodes } },
    include: { Details: true },
    orderBy: { CreatedDate: "desc" },
  });
  return apiSuccess(headers);
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  let body: { documentCode?: unknown; requestDate?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (!isValidRequestDocumentCode(body.documentCode)) {
    return apiError(400, "VALIDATION_FAILED", "documentCode must be one of the allowed values");
  }
  const requestDate = typeof body.requestDate === "string" ? body.requestDate : "";
  if (!requestDate) return apiError(400, "INVALID_PARAMS", "requestDate is required");
  const parsedDate = new Date(requestDate);
  if (Number.isNaN(parsedDate.getTime())) return apiError(400, "VALIDATION_FAILED", "requestDate is invalid");

  const docType = REQUEST_DOCUMENT_DOCTYPE[body.documentCode];
  const denied = await requirePermission(user, docType, "save");
  if (denied) return denied;

  const documentNo = await consumeDocumentNumber(body.documentCode, `เอกสาร ${body.documentCode}`);

  const created = await prisma.trnRequestHeader.create({
    data: {
      DocumentCode: body.documentCode,
      DocumentNo: documentNo,
      RequestDate: parsedDate,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim() : null,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_REQUEST", { targetTable: "trn_request_header", targetId: String(created.RequestHeaderID) });
  return apiSuccess(created, 201);
}
