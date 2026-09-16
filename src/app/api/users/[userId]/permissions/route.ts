import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";

interface PermissionInput {
  documentType: string;
  siteCode?: string | null;
  canRead?: boolean;
  canSave?: boolean;
  canDelete?: boolean;
  canApprove?: boolean;
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/users/[userId]/permissions">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "read");
  if (denied) return denied;

  const { userId } = await ctx.params;

  const permissions = await prisma.sysUserPermission.findMany({
    where: { UserID: userId },
    select: { PermissionID: true, DocumentType: true, SiteCode: true, CanRead: true, CanSave: true, CanDelete: true, CanApprove: true },
    orderBy: { DocumentType: "asc" },
  });

  return apiSuccess(permissions);
}

// Replaces the user's entire permission set (the UI sends the full grid on
// every save — simpler and safer than diffing individual checkbox toggles).
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/users/[userId]/permissions">) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const denied = await requirePermission(user, "USER", "save");
  if (denied) return denied;

  const { userId } = await ctx.params;

  const target = await prisma.sysUser.findUnique({ where: { UserID: userId } });
  if (!target) return apiError(404, "USER_NOT_FOUND");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }

  if (!Array.isArray(body)) {
    return apiError(400, "INVALID_PARAMS", "Request body must be an array of permission rows");
  }

  const rows = body as PermissionInput[];
  const validDocumentTypes = new Set((await prisma.sysMenu.findMany({ select: { DocumentType: true } })).map((m) => m.DocumentType));

  for (const row of rows) {
    if (typeof row.documentType !== "string" || !validDocumentTypes.has(row.documentType)) {
      return apiError(400, "VALIDATION_FAILED", "Unknown documentType", { documentType: row.documentType });
    }
  }

  // Drop rows with every flag off — equivalent to no permission at all.
  const toInsert = rows.filter((r) => r.canRead || r.canSave || r.canDelete || r.canApprove);

  await prisma.$transaction([
    prisma.sysUserPermission.deleteMany({ where: { UserID: userId } }),
    ...(toInsert.length > 0
      ? [
          prisma.sysUserPermission.createMany({
            data: toInsert.map((r) => ({
              UserID: userId,
              DocumentType: r.documentType,
              SiteCode: r.siteCode ?? null,
              CanRead: !!r.canRead,
              CanSave: !!r.canSave,
              CanDelete: !!r.canDelete,
              CanApprove: !!r.canApprove,
            })),
          }),
        ]
      : []),
  ]);

  await logAction(user.userId, "UPDATE_PERMISSIONS", { targetTable: "sys_user_permission", targetId: userId });

  return apiSuccess({ ok: true, count: toInsert.length });
}
