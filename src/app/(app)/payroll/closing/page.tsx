import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import PayrollClosingView from "./payroll-closing-view";

export default async function PayrollClosingPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canClose = await hasPermission(user, "PAYROLL_CLOSING", "approve");
  if (!canClose) redirect("/");

  const [periodsRaw, companies] = await Promise.all([
    prisma.sysPeriod.findMany({ orderBy: { PeriodID: "desc" } }),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" }, select: { CompanyCode: true, CompanyName: true } }),
  ]);

  const periods = JSON.parse(JSON.stringify(periodsRaw));

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">ปิดสิ้นงวด</h1>
      <PayrollClosingView periods={periods} companies={companies} />
    </div>
  );
}
