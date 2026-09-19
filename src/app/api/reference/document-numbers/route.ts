import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withNextNumber } from "@/lib/document-number";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const rows = await prisma.refDocumentNumber.findMany({ orderBy: { DocumentCode: "asc" } });
  return apiSuccess(rows.map(withNextNumber));
}

export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  let body: { documentCode?: unknown; description?: unknown; isCustomNumber?: unknown; useYearMonthPrefix?: unknown; latestNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const documentCode = typeof body.documentCode === "string" ? body.documentCode.trim() : "";
  if (!documentCode) return apiError(400, "INVALID_PARAMS", "documentCode is required");

  const latestNumber = body.latestNumber !== undefined && body.latestNumber !== "" ? Number(body.latestNumber) : 0;
  if (!Number.isInteger(latestNumber) || latestNumber < 0) {
    return apiError(400, "VALIDATION_FAILED", "latestNumber must be a non-negative integer");
  }

  const existing = await prisma.refDocumentNumber.findUnique({ where: { DocumentCode: documentCode } });
  if (existing) return apiError(409, "DOCUMENT_NUMBER_ALREADY_EXISTS", undefined, { documentCode });

  const created = await prisma.refDocumentNumber.create({
    data: {
      DocumentCode: documentCode,
      Description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      IsCustomNumber: body.isCustomNumber === true,
      UseYearMonthPrefix: body.useYearMonthPrefix === true,
      LatestNumber: latestNumber,
      CreatedBy: user.userId,
    },
  });

  await logAction(user.userId, "CREATE_DOCUMENT_NUMBER", { targetTable: "ref_document_number", targetId: String(created.DocumentNumberID) });
  return apiSuccess(withNextNumber(created), 201);
}
