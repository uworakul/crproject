import "server-only";
import { Document, Page, View } from "@react-pdf/renderer";
import { SafeText, styles, money } from "@/lib/pdf/layout";

// ใบแนบ ภ.ง.ด.1 — laid out like the Revenue Department's attachment sheet
// (8 people per sheet, running sequence across sheets, per-sheet totals).
// Data-table fidelity, not a pixel-exact reproduction. The "ล้างข้อมูล"
// button of the fillable PDF is intentionally not reproduced.
export interface Pnd1FormRow {
  idCardNo: string;
  firstName: string;
  lastName: string;
  payDate: string; // pre-formatted วัน/เดือน/ปี พ.ศ., "" if unknown
  income: string;
  taxWithheld: string;
}

const ROWS_PER_SHEET = 8;
const cell = { borderRight: "1pt solid #6b7280", borderBottom: "1pt solid #6b7280", padding: 4, overflow: "hidden" as const };

// Only ประเภทเงินได้ (1) — เงินเดือน ค่าจ้าง กรณีทั่วไป — applies to this
// payroll; the other four are shown unchecked like the blank form.
const INCOME_TYPES = [
  "(1) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป",
  "(2) เงินได้ตามมาตรา 40 (1) เงินเดือน ค่าจ้าง ฯลฯ กรณีได้รับอนุมัติจากกรมสรรพากรให้หักอัตราร้อยละ 3",
  "(3) เงินได้ตามมาตรา 40 (1) (2) กรณีนายจ้างจ่ายให้ครั้งเดียวเพราะเหตุออกจากงาน",
  "(4) เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้เป็นผู้อยู่ในประเทศไทย",
  "(5) เงินได้ตามมาตรา 40 (2) กรณีผู้รับเงินได้มิได้เป็นผู้อยู่ในประเทศไทย",
];

export default function Pnd1FormPdf({ employerTaxId, rows }: { employerTaxId: string; rows: Pnd1FormRow[] }) {
  const sheets: Pnd1FormRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) sheets.push(rows.slice(i, i + ROWS_PER_SHEET));
  if (sheets.length === 0) sheets.push([]);

  return (
    <Document>
      {sheets.map((sheetRows, sheetIdx) => {
        const incomeTotal = sheetRows.reduce((s, r) => s + Number(r.income), 0);
        const taxTotal = sheetRows.reduce((s, r) => s + Number(r.taxWithheld), 0);
        const padded: (Pnd1FormRow | null)[] = [...sheetRows, ...Array(ROWS_PER_SHEET - sheetRows.length).fill(null)];
        return (
          <Page key={sheetIdx} size="A4" orientation="landscape" style={{ ...styles.page, padding: 20, fontSize: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
              <View>
                <SafeText style={{ fontSize: 15, fontWeight: "bold" }}>ใบแนบ ภ.ง.ด.1</SafeText>
                <SafeText>เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีหน้าที่หักภาษี ณ ที่จ่าย) {employerTaxId || "-"}</SafeText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <SafeText>สาขาที่ ..........</SafeText>
                <SafeText>
                  แผ่นที่ {sheetIdx + 1} ในจำนวน {sheets.length} แผ่น
                </SafeText>
              </View>
            </View>

            <View style={{ border: "1pt solid #6b7280", padding: 4, marginBottom: 4 }}>
              <SafeText style={{ fontSize: 7 }}>(ให้แยกกรอกรายการในใบแนบนี้ตามเงินได้แต่ละประเภท โดยใส่เครื่องหมาย ✓ ลงใน [ ] หน้าข้อความแล้วแต่กรณี เพียงข้อเดียว)</SafeText>
              <SafeText style={{ fontWeight: "bold" }}>ประเภทเงินได้</SafeText>
              {INCOME_TYPES.map((t, i) => (
                <SafeText key={i}>
                  {i === 0 ? "[ ✓ ]" : "[   ]"} {t}
                </SafeText>
              ))}
            </View>

            <View style={{ borderTop: "1pt solid #6b7280", borderLeft: "1pt solid #6b7280" }}>
              <View style={{ flexDirection: "row", backgroundColor: "#f3f4f6" }}>
                <View style={{ ...cell, flex: 1 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>ลำดับที่</SafeText>
                </View>
                <View style={{ ...cell, flex: 7 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>เลขประจำตัวผู้เสียภาษีอากร (ของผู้มีเงินได้) / ชื่อผู้มีเงินได้ / ชื่อสกุล</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>วัน เดือน ปี ที่จ่าย</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>จำนวนเงินได้ที่จ่ายในครั้งนี้</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>จำนวนเงินภาษีที่หักและนำส่งในครั้งนี้</SafeText>
                </View>
                <View style={{ ...cell, flex: 1 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>เงื่อนไข *</SafeText>
                </View>
              </View>
              {padded.map((r, i) => (
                <View key={i} style={{ flexDirection: "row", minHeight: 30 }}>
                  <View style={{ ...cell, flex: 1 }}>
                    <SafeText style={{ textAlign: "center" }}>{r ? sheetIdx * ROWS_PER_SHEET + i + 1 : ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 7 }}>
                    <SafeText>{r?.idCardNo ?? ""}</SafeText>
                    <SafeText>{r ? `ชื่อ ${r.firstName}     ชื่อสกุล ${r.lastName}` : "ชื่อ                                      ชื่อสกุล"}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 2 }}>
                    <SafeText style={{ textAlign: "center" }}>{r?.payDate ?? ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 2 }}>
                    <SafeText style={{ textAlign: "right" }}>{r ? money(r.income) : ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 2 }}>
                    <SafeText style={{ textAlign: "right" }}>{r ? money(r.taxWithheld) : ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 1 }}>
                    <SafeText style={{ textAlign: "center" }}>{r ? "1" : ""}</SafeText>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: "row", backgroundColor: "#f9fafb" }}>
                <View style={{ ...cell, flex: 10 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>รวมยอดเงินได้และภาษีที่นำส่ง (นำไปรวมกับใบแนบ ภ.ง.ด.1 แผ่นอื่น (ถ้ามี))</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>{money(incomeTotal)}</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>{money(taxTotal)}</SafeText>
                </View>
                <View style={{ ...cell, flex: 1 }} />
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <View style={{ flex: 3 }}>
                <SafeText style={{ fontSize: 7 }}>(ให้กรอกลำดับที่ต่อเนื่องกันไปทุกแผ่นตามเงินได้แต่ละประเภท)</SafeText>
                <SafeText style={{ fontSize: 7, fontWeight: "bold" }}>หมายเหตุ * เงื่อนไขการหักภาษีให้กรอกดังนี้</SafeText>
                <SafeText style={{ fontSize: 7 }}>■ หัก ณ ที่จ่าย กรอก 1   ■ ออกให้ตลอดไป กรอก 2   ■ ออกให้ครั้งเดียว กรอก 3</SafeText>
              </View>
              <View style={{ flex: 2, marginLeft: 20 }}>
                <SafeText>ลงชื่อ .................................................. ผู้จ่ายเงิน</SafeText>
                <SafeText style={{ marginTop: 5 }}>ตำแหน่ง ..................................................</SafeText>
                <SafeText style={{ marginTop: 5 }}>ยื่นวันที่ ........ เดือน .................... พ.ศ. ..........</SafeText>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
