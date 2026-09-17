interface PayrollRow {
  TransactionID: number;
  Period: { PeriodYear: number; PeriodMonth: number } | null;
  Site: { SiteName: string } | null;
  WorkDays: string;
  GrossWage: string;
  NetPay: string;
  CreatedDate: string;
}

export default function PayrollHistoryTab({ rows }: { rows: PayrollRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2 font-medium">งวด</th>
            <th className="px-3 py-2 font-medium">หน่วยงาน</th>
            <th className="px-3 py-2 font-medium text-right">วันทำงาน</th>
            <th className="px-3 py-2 font-medium text-right">เงินได้รวม</th>
            <th className="px-3 py-2 font-medium text-right">สุทธิ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.TransactionID} className="border-t border-gray-100">
              <td className="px-3 py-2">{r.Period ? `${r.Period.PeriodMonth}/${r.Period.PeriodYear}` : "-"}</td>
              <td className="px-3 py-2 text-gray-500">{r.Site?.SiteName ?? "-"}</td>
              <td className="px-3 py-2 text-right">{Number(r.WorkDays).toLocaleString("th-TH")}</td>
              <td className="px-3 py-2 text-right">{Number(r.GrossWage).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-2 text-right font-medium">{Number(r.NetPay).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                ยังไม่มีประวัติการจ่ายเงินเดือน
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
