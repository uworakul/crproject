import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";

// Reference data (which DocumentTypes exist) — not sensitive on its own,
// any authenticated user can read it (needed to render permission grids etc).
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");

  const menus = await prisma.sysMenu.findMany({
    where: { IsActive: true },
    orderBy: [{ ModuleGroup: "asc" }, { DocumentType: "asc" }],
  });

  return apiSuccess(menus);
}
