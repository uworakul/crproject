import "server-only";
import { ReportPage, ReportTable, type ReportColumn } from "@/lib/pdf/layout";

// Generic "flat/matrix table" report PDF — reused by bank remittance,
// department/site summary, all 4 debt reports, and the employee registry.
// Everything report-specific (which columns, how rows are formatted) is
// decided by the caller before this ever runs.
export default function TableReportPdf({
  companyName,
  title,
  filterSummary,
  columns,
  rows,
  totalRow,
  orientation = "portrait",
  boldRowIndices,
}: {
  companyName: string;
  title: string;
  filterSummary: string;
  columns: ReportColumn[];
  rows: (string | number)[][];
  totalRow?: (string | number)[];
  orientation?: "portrait" | "landscape";
  boldRowIndices?: number[];
}) {
  return (
    <ReportPage companyName={companyName} title={title} filterSummary={filterSummary} orientation={orientation}>
      <ReportTable columns={columns} rows={rows} totalRow={totalRow} boldRowIndices={boldRowIndices} />
    </ReportPage>
  );
}
