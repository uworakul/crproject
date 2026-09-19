import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { withNextNumber } from "@/lib/document-number";

export async function PUT(request: NextRequest, ctx: RouteContext<"/api/reference/document-numbers/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "save");
  if (denied) return denied;

  const { id } = await ctx.params;
  const documentNumberId = Number(id);
  if (!Number.isInteger(documentNumberId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refDocumentNumber.findUnique({ where: { DocumentNumberID: documentNumberId } });
  if (!existing) return apiError(404, "DOCUMENT_NUMBER_NOT_FOUND");

  let body: { documentCode?: unknown; description?: unknown; isCustomNumber?: unknown; useYearMonthPrefix?: unknown; latestNumber?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  const documentCode = typeof body.documentCode === "string" ? body.documentCode.trim() : undefined;
  if (documentCode) {
    const conflict = await prisma.refDocumentNumber.findUnique({ where: { DocumentCode: documentCode } });
    if (conflict && conflict.DocumentNumberID !== documentNumberId) {
      return apiError(409, "DOCUMENT_NUMBER_ALREADY_EXISTS", undefined, { documentCode });
    }
  }

  let latestNumber: number | undefined;
  if (body.latestNumber !== undefined && body.latestNumber !== "") {
    latestNumber = Number(body.latestNumber);
    if (!Number.isInteger(latestNumber) || latestNumber < 0) {
      return apiError(400, "VALIDATION_FAILED", "latestNumber must be a non-negative integer");
    }
  }

  const updated = await prisma.refDocumentNumber.update({
    where: { DocumentNumberID: documentNumberId },
    data: {
      DocumentCode: documentCode || undefined,
      Description: typeof body.description === "string" ? body.description.trim() || null : undefined,
      IsCustomNumber: typeof body.isCustomNumber === "boolean" ? body.isCustomNumber : undefined,
      UseYearMonthPrefix: typeof body.useYearMonthPrefix === "boolean" ? body.useYearMonthPrefix : undefined,
      LatestNumber: latestNumber,
      UpdatedBy: user.userId,
      UpdatedDate: new Date(),
    },
  });

  await logAction(user.userId, "UPDATE_DOCUMENT_NUMBER", { targetTable: "ref_document_number", targetId: id });
  return apiSuccess(withNextNumber(updated));
}

// Hard delete — no IsActive column, standalone reference data (no other
// table references this yet, same as ref_company/ref_black_list).
export async function DELETE(_req: Request, ctx: RouteContext<"/api/reference/document-numbers/[id]">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "delete");
  if (denied) return denied;

  const { id } = await ctx.params;
  const documentNumberId = Number(id);
  if (!Number.isInteger(documentNumberId)) return apiError(400, "INVALID_PARAMS");

  const existing = await prisma.refDocumentNumber.findUnique({ where: { DocumentNumberID: documentNumberId } });
  if (!existing) return apiError(404, "DOCUMENT_NUMBER_NOT_FOUND");

  await prisma.refDocumentNumber.delete({ where: { DocumentNumberID: documentNumberId } });
  await logAction(user.userId, "DELETE_DOCUMENT_NUMBER", { targetTable: "ref_document_number", targetId: id });
  return apiSuccess({ ok: true });
}
