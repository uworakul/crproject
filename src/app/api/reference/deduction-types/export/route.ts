import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildThreeColumnWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "read");
  if (denied) return denied;

  const deductionTypes = await prisma.refDeductionType.findMany({ orderBy: { DeductionCode: "asc" } });
  const buffer = await buildThreeColumnWorkbook(
    "รายการหัก",
    "รหัสรายการหัก",
    "ชื่อรายการหัก",
    "หักเป็นงวด",
    deductionTypes.map((d) => ({ code: d.DeductionCode, name: d.DeductionName, flag: d.IsInstallment })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="deduction-types.xlsx"',
    },
  });
}
