import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { prisma } from "@/lib/prisma";
import Tabs from "../../reference/tabs";
import EmployeeInfoTab from "./employee-info-tab";
import PersonalInfoTab from "./personal-info-tab";
import IncomeTab from "./income-tab";
import TaxDeductionTab from "./tax-deduction-tab";
import WorkExperienceTab from "./work-experience-tab";
import TrainingExperienceTab from "./training-experience-tab";
import InstallmentDeductionTab from "./installment-deduction-tab";
import HistoryTab from "./history-tab";
import PayrollHistoryTab from "./payroll-history-tab";

export default async function EmployeeDetailPage({ params }: { params: Promise<{ empCode: string }> }) {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "EMPLOYEE", "read");
  if (!canRead) redirect("/");

  const { empCode } = await params;

  const [
    employeeRaw,
    departmentsRaw,
    positionsRaw,
    sitesRaw,
    banksRaw,
    companiesRaw,
    blacklistRaw,
    workExperienceRaw,
    trainingExperienceRaw,
    installmentDeductionsRaw,
    installmentDeductionTypesRaw,
    historyRaw,
    payrollHistoryRaw,
    canSaveEmployee,
    canReadHistory,
    canSaveHistory,
    canReadPayroll,
  ] = await Promise.all([
    prisma.mstEmployee.findUnique({ where: { EmpCode: empCode } }),
    prisma.refDepartment.findMany({ where: { IsActive: true }, orderBy: { DeptCode: "asc" } }),
    prisma.refPosition.findMany({ where: { IsActive: true }, orderBy: { PositionCode: "asc" } }),
    prisma.mstSite.findMany({ where: { IsActive: true }, orderBy: { SiteCode: "asc" } }),
    prisma.refBank.findMany({ where: { IsActive: true }, orderBy: { BankCode: "asc" } }),
    prisma.refCompany.findMany({ orderBy: { CompanyCode: "asc" } }),
    prisma.refBlackList.findMany({ orderBy: { IDCardNo: "asc" } }),
    prisma.mstEmployeeWorkExperience.findMany({ where: { EmpCode: empCode }, orderBy: { StartDate: "desc" } }),
    prisma.mstEmployeeTrainingExperience.findMany({ where: { EmpCode: empCode }, orderBy: { StartDate: "desc" } }),
    prisma.invEmployeeDebt.findMany({
      where: { EmpCode: empCode },
      include: {
        DeductionType: { select: { DeductionCode: true, DeductionName: true } },
        RequestHeader: { select: { DocumentNo: true, ApprovedDate: true } },
      },
      orderBy: { DebtID: "desc" },
    }),
    prisma.refDeductionType.findMany({ where: { IsInstallment: true }, orderBy: { DeductionCode: "asc" } }),
    prisma.mstEmployeeHistory.findMany({ where: { EmpCode: empCode }, orderBy: { RecordedDate: "desc" } }),
    prisma.trnPayrollTransaction.findMany({
      where: { EmpCode: empCode },
      include: { Period: true, Site: { select: { SiteName: true } } },
      orderBy: { CreatedDate: "desc" },
    }),
    hasPermission(user, "EMPLOYEE", "save"),
    hasPermission(user, "EMPLOYEE_HISTORY", "read"),
    hasPermission(user, "EMPLOYEE_HISTORY", "save"),
    hasPermission(user, "EMPLOYEE_PAYROLL", "read"),
  ]);

  if (!employeeRaw) notFound();

  // Prisma.Decimal and BigInt (mst_employee_history.HistoryID) aren't plain
  // values React Server Components can pass to a Client Component —
  // round-trip through JSON with a replacer that stringifies BigInt first
  // (JSON.stringify throws on raw BigInt).
  const [
    employee,
    departments,
    positions,
    sites,
    banks,
    companies,
    blacklist,
    workExperience,
    trainingExperience,
    installmentDeductions,
    installmentDeductionTypes,
    history,
    payrollHistory,
  ] = JSON.parse(
    JSON.stringify(
      [
        employeeRaw,
        departmentsRaw,
        positionsRaw,
        sitesRaw,
        banksRaw,
        companiesRaw,
        blacklistRaw,
        workExperienceRaw,
        trainingExperienceRaw,
        installmentDeductionsRaw,
        installmentDeductionTypesRaw,
        historyRaw,
        payrollHistoryRaw,
      ],
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
    ),
  );

  const tabs = [
    {
      label: "ข้อมูลพนักงาน",
      content: (
        <EmployeeInfoTab
          employee={employee}
          departments={departments}
          positions={positions}
          sites={sites}
          companies={companies}
          blacklist={blacklist}
          canSave={canSaveEmployee}
        />
      ),
    },
    {
      label: "ข้อมูลส่วนบุคคล",
      content: <PersonalInfoTab employee={employee} canSave={canSaveEmployee} />,
    },
    {
      label: "ประวัติการทำงาน",
      content: <WorkExperienceTab empCode={empCode} initialRows={workExperience} canSave={canSaveEmployee} />,
    },
    {
      label: "ประวัติการฝึกอบรม",
      content: <TrainingExperienceTab empCode={empCode} initialRows={trainingExperience} canSave={canSaveEmployee} />,
    },
    {
      label: "ข้อมูลลดหย่อนภาษี",
      content: <TaxDeductionTab employee={employee} canSave={canSaveEmployee} />,
    },
    {
      label: "รายได้",
      content: <IncomeTab employee={employee} banks={banks} canSave={canSaveEmployee} />,
    },
    {
      label: "รายการหักต่องวด",
      content: (
        <InstallmentDeductionTab
          empCode={empCode}
          initialRows={installmentDeductions}
          deductionTypes={installmentDeductionTypes}
          canSave={canSaveEmployee}
        />
      ),
    },
  ];

  if (canReadPayroll) {
    tabs.push({ label: "ประวัติการจ่าย", content: <PayrollHistoryTab rows={payrollHistory} /> });
  }
  if (canReadHistory) {
    tabs.push({ label: "Note", content: <HistoryTab empCode={empCode} initialHistory={history} canSave={canSaveHistory} /> });
  }

  return (
    <div className="w-full px-6 py-8">
      <Link href="/employees" className="text-sm text-gray-500 hover:underline">
        ← กลับทะเบียนพนักงาน
      </Link>
      <h1 className="mb-6 mt-2 text-lg font-semibold text-gray-900">
        {employee.EmpCode} — {employee.FullName}
      </h1>
      <Tabs tabs={tabs} />
    </div>
  );
}
