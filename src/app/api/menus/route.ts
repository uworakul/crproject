import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";

// Reference data (which DocumentTypes exist) — not sensitive on its own,
// any authenticated user can read it (needed to render permission grids etc).
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  // Pass Checking off => system locked for everyone except System Configuration.
  if (user.systemLocked) return apiError(403, "SYSTEM_LOCKED", "ระบบถูกล็อกจนกว่าจะผ่านการตรวจสอบ (Pass Checking) ที่หน้า System Configuration");

  const menus = await prisma.sysMenu.findMany({
    where: { IsActive: true },
    orderBy: [{ ModuleGroup: "asc" }, { DocumentType: "asc" }],
  });

  return apiSuccess(menus);
}
