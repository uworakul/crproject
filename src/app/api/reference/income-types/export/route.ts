import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError } from "@/lib/api-response";
import { buildTwoColumnWorkbook } from "@/lib/excel-reference";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "INCOME_DEDUCTION", "read");
  if (denied) return denied;

  const incomeTypes = await prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" } });
  const buffer = await buildTwoColumnWorkbook(
    "รายได้",
    "รหัสรายได้",
    "ชื่อรายได้",
    incomeTypes.map((i) => ({ code: i.IncomeCode, name: i.IncomeName })),
  );

  return new Response(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="income-types.xlsx"',
    },
  });
}
