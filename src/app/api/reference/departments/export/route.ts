import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildTwoColumnWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "REFERENCE", "read");
  if (denied) return denied;

  const departments = await prisma.refDepartment.findMany({ orderBy: { DeptCode: "asc" } });
  const buffer = await buildTwoColumnWorkbook(
    "แผนก",
    "รหัสแผนก",
    "ชื่อแผนก",
    departments.map((d) => ({ code: d.DeptCode, name: d.DeptName })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="departments.xlsx"',
    },
  });
}
