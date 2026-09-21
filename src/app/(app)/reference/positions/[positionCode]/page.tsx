import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import PositionIncomePanel from "./position-income-panel";

export default async function PositionIncomePage({ params }: { params: Promise<{ positionCode: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "REFERENCE", "read");
  if (!canRead) redirect("/");

  const { positionCode } = await params;

  const [canSave, canDelete, position, incomesRaw, incomeTypes] = await Promise.all([
    hasPermission(user, "REFERENCE", "save"),
    hasPermission(user, "REFERENCE", "delete"),
    prisma.refPosition.findUnique({ where: { PositionCode: positionCode } }),
    prisma.mstPositionIncome.findMany({
      where: { PositionCode: positionCode },
      include: { IncomeType: { select: { IncomeName: true } } },
      orderBy: { IncomeCode: "asc" },
    }),
    prisma.refIncomeType.findMany({ orderBy: { IncomeCode: "asc" }, select: { IncomeCode: true, IncomeName: true } }),
  ]);

  if (!position) notFound();

  const incomes = JSON.parse(JSON.stringify(incomesRaw));

  return (
    <div className="w-full px-6 py-8">
      <Link href="/reference" className="text-sm text-gray-500 hover:underline">
        ← กลับรหัสอ้างอิงหลัก
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        {position.PositionCode} — {position.PositionName}: รายได้พื้นฐาน
      </h1>
      <PositionIncomePanel positionCode={positionCode} initialIncomes={incomes} incomeTypes={incomeTypes} canSave={canSave} canDelete={canDelete} />
    </div>
  );
}
