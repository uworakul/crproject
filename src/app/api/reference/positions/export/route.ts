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

  const positions = await prisma.refPosition.findMany({ orderBy: { PositionCode: "asc" } });
  const buffer = await buildTwoColumnWorkbook(
    "ตำแหน่ง",
    "รหัสตำแหน่ง",
    "ชื่อตำแหน่ง",
    positions.map((p) => ({ code: p.PositionCode, name: p.PositionName })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="positions.xlsx"',
    },
  });
}
