import "server-only";
import { View } from "@react-pdf/renderer";
import { ReportPage, SafeText, money } from "@/lib/pdf/layout";
import type { PayslipData } from "../payroll-reports";

// One payslip per employee, one page each — a genuinely different shape
// from the flat/matrix tables the other reports share (TableReportPdf), so
// it gets its own component. Two side-by-side columns (income/deduction),
// net pay highlighted at the bottom, mirroring the breakdown the
// "คำนวณเงินได้ประจำงวด" screen already shows on screen for the same data.
// Every label/amount pair sharing a row is wrapped in its own View "cell"
// (not a bare <Text> as a flex sibling) — same fix as ReportTable, needed
// here too since a long item label (e.g. a debt description) can wrap.
export default function PayslipPdf({ companyName, slips }: { companyName: string; slips: PayslipData[] }) {
  return (
    <ReportPage companyName={companyName} title="สลิปเงินเดือน (Payslip)" filterSummary="">
      {slips.map((s, i) => (
        <View key={s.transactionId} style={{ marginBottom: 16, paddingBottom: 12, borderBottom: i < slips.length - 1 ? "1pt dashed #d1d5db" : undefined }} break={i > 0}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
            <View style={{ flex: 3 }}>
              <SafeText style={{ fontWeight: "bold" }}>
                {s.empCode} — {s.fullName}
              </SafeText>
              <SafeText style={{ color: "#6b7280" }}>
                {s.deptName ?? "-"} · {s.positionName ?? "-"} · {s.siteName ?? "-"}
              </SafeText>
            </View>
            <View style={{ flex: 1 }}>
              <SafeText style={{ color: "#6b7280", textAlign: "right" }}>{s.periodLabel}</SafeText>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, border: "1pt solid #d1d5db" }}>
              <SafeText style={{ backgroundColor: "#f3f4f6", padding: 3, fontWeight: "bold" }}>รายได้</SafeText>
              {s.incomeItems.length === 0 && <SafeText style={{ padding: 3, color: "#9ca3af" }}>ไม่มีรายการ</SafeText>}
              {s.incomeItems.map((it, j) => (
                <View key={j} style={{ flexDirection: "row", padding: 3, borderTop: "1pt solid #e5e7eb" }}>
                  <View style={{ flex: 3 }}>
                    <SafeText>
                      {it.label}
                      {it.days ? ` (${it.days} วัน)` : it.hours ? ` (${it.hours} ชม.)` : ""}
                    </SafeText>
                  </View>
                  <View style={{ flex: 2 }}>
                    <SafeText style={{ textAlign: "right" }}>{money(it.amount)}</SafeText>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: "row", padding: 3, borderTop: "1pt solid #9ca3af" }}>
                <View style={{ flex: 3 }}>
                  <SafeText style={{ fontWeight: "bold" }}>รวมรายได้</SafeText>
                </View>
                <View style={{ flex: 2 }}>
                  <SafeText style={{ textAlign: "right", fontWeight: "bold" }}>{money(s.totalIncome)}</SafeText>
                </View>
              </View>
            </View>
            <View style={{ flex: 1, border: "1pt solid #d1d5db" }}>
              <SafeText style={{ backgroundColor: "#f3f4f6", padding: 3, fontWeight: "bold" }}>รายการหัก</SafeText>
              {s.deductionItems.length === 0 && <SafeText style={{ padding: 3, color: "#9ca3af" }}>ไม่มีรายการ</SafeText>}
              {s.deductionItems.map((it, j) => (
                <View key={j} style={{ flexDirection: "row", padding: 3, borderTop: "1pt solid #e5e7eb" }}>
                  <View style={{ flex: 3 }}>
                    <SafeText>{it.label}</SafeText>
                  </View>
                  <View style={{ flex: 2 }}>
                    <SafeText style={{ textAlign: "right" }}>{money(it.amount)}</SafeText>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: "row", padding: 3, borderTop: "1pt solid #9ca3af" }}>
                <View style={{ flex: 3 }}>
                  <SafeText style={{ fontWeight: "bold" }}>รวมรายการหัก</SafeText>
                </View>
                <View style={{ flex: 2 }}>
                  <SafeText style={{ textAlign: "right", fontWeight: "bold" }}>{money(s.totalDeduction)}</SafeText>
                </View>
              </View>
            </View>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, padding: 4, backgroundColor: "#f0fdf4" }}>
            <SafeText style={{ fontWeight: "bold" }}>เงินได้สุทธิ</SafeText>
            <SafeText style={{ fontWeight: "bold" }}>{money(s.netPay)} บาท</SafeText>
          </View>
          <SafeText style={{ marginTop: 2, fontSize: 8, color: "#9ca3af" }}>
            โอนเข้าบัญชี: {s.bankName ?? "ไม่มีข้อมูลธนาคาร"} {s.bankAccountNo ?? ""}
          </SafeText>
        </View>
      ))}
    </ReportPage>
  );
}
