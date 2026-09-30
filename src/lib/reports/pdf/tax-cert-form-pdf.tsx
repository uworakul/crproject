import "server-only";
import { Document, Page, View } from "@react-pdf/renderer";
import { SafeText, styles, money } from "@/lib/pdf/layout";
import { thaiBahtText } from "@/lib/pdf/thai-baht-text";

// หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) — one A4 portrait page per
// employee, laid out like the Revenue Department's form. Data-table
// fidelity, not a pixel-exact reproduction. Only the "เงินเดือน ค่าจ้าง"
// income line (มาตรา 40(1)) applies to this payroll.
export interface TaxCertRow {
  seq: number;
  idCardNo: string;
  fullName: string;
  address: string;
  totalIncome: string;
  totalTaxWithheld: string;
  totalSso: string;
}

const box = { border: "1pt solid #6b7280", padding: 5, marginBottom: 5 };
const cell = { borderRight: "1pt solid #6b7280", borderBottom: "1pt solid #6b7280", padding: 4, overflow: "hidden" as const };
const PND_FORMS = ["(1) ภ.ง.ด.1ก", "(2) ภ.ง.ด.1ก พิเศษ", "(3) ภ.ง.ด.2", "(4) ภ.ง.ด.3", "(5) ภ.ง.ด.2ก", "(6) ภ.ง.ด.3ก", "(7) ภ.ง.ด.53"];

export default function TaxCertFormPdf({
  companyName,
  companyAddress,
  companyTaxId,
  taxYearBE,
  rows,
}: {
  companyName: string;
  companyAddress: string;
  companyTaxId: string;
  taxYearBE: number;
  rows: TaxCertRow[];
}) {
  return (
    <Document>
      {rows.map((r) => (
        <Page key={r.seq} size="A4" style={{ ...styles.page, padding: 28, fontSize: 9 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <SafeText style={{ fontSize: 8 }}>ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</SafeText>
              <SafeText style={{ fontSize: 8 }}>ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</SafeText>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <SafeText>เล่มที่ ..........</SafeText>
              <SafeText>เลขที่ {taxYearBE}-{r.seq}</SafeText>
            </View>
          </View>
          <SafeText style={{ fontSize: 13, fontWeight: "bold", textAlign: "center", marginTop: 4 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</SafeText>
          <SafeText style={{ textAlign: "center", marginBottom: 6 }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</SafeText>

          <View style={box}>
            <SafeText style={{ fontWeight: "bold" }}>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :</SafeText>
            <SafeText>เลขประจำตัวผู้เสียภาษีอากร {companyTaxId || "-"}</SafeText>
            <SafeText>ชื่อ {companyName}</SafeText>
            <SafeText>ที่อยู่ {companyAddress || "-"}</SafeText>
          </View>

          <View style={box}>
            <SafeText style={{ fontWeight: "bold" }}>ผู้ถูกหักภาษี ณ ที่จ่าย :</SafeText>
            <SafeText>เลขประจำตัวผู้เสียภาษีอากร {r.idCardNo || "-"}</SafeText>
            <SafeText>ชื่อ {r.fullName}</SafeText>
            <SafeText>ที่อยู่ {r.address || "-"}</SafeText>
            <SafeText style={{ marginTop: 3 }}>ลำดับที่ {r.seq} ในแบบ</SafeText>
            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
              {PND_FORMS.map((f, i) => (
                <SafeText key={f} style={{ marginRight: 12 }}>
                  {i === 0 ? "[ ✓ ]" : "[   ]"} {f}
                </SafeText>
              ))}
            </View>
          </View>

          <View style={{ borderTop: "1pt solid #6b7280", borderLeft: "1pt solid #6b7280" }}>
            <View style={{ flexDirection: "row", backgroundColor: "#f3f4f6" }}>
              <View style={{ ...cell, flex: 5 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>ประเภทเงินได้พึงประเมินที่จ่าย</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>วัน เดือน หรือปีภาษี ที่จ่าย</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>จำนวนเงินที่จ่าย</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>ภาษีที่หักและนำส่ง</SafeText>
              </View>
            </View>
            <View style={{ flexDirection: "row", minHeight: 170 }}>
              <View style={{ ...cell, flex: 5 }}>
                <SafeText>มาตรา 40(1) เงินเดือน ค่าจ้าง ฯลฯ</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ textAlign: "center" }}>{taxYearBE}</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ textAlign: "right" }}>{money(r.totalIncome)}</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ textAlign: "right" }}>{money(r.totalTaxWithheld)}</SafeText>
              </View>
            </View>
            <View style={{ flexDirection: "row", backgroundColor: "#f9fafb" }}>
              <View style={{ ...cell, flex: 7 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>รวมเงินที่จ่ายและภาษีที่หักนำส่ง</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>{money(r.totalIncome)}</SafeText>
              </View>
              <View style={{ ...cell, flex: 2 }}>
                <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>{money(r.totalTaxWithheld)}</SafeText>
              </View>
            </View>
          </View>

          <View style={{ ...box, marginTop: 5, backgroundColor: "#f3f4f6" }}>
            <SafeText>
              <SafeText style={{ fontWeight: "bold" }}>รวมเงินภาษีที่หักนำส่ง (ตัวอักษร) </SafeText>
              {thaiBahtText(r.totalTaxWithheld)}
            </SafeText>
          </View>

          <View style={box}>
            <SafeText style={{ fontWeight: "bold" }}>เงินที่จ่ายเข้า</SafeText>
            <SafeText>กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน 0.00 บาท   กองทุนประกันสังคม {money(r.totalSso)} บาท   กองทุนสำรองเลี้ยงชีพ 0.00 บาท</SafeText>
          </View>

          <View style={box}>
            <SafeText style={{ fontWeight: "bold" }}>ผู้จ่ายเงิน</SafeText>
            <SafeText>[ ✓ ] (1) หัก ณ ที่จ่าย   [   ] (2) ออกให้ตลอดไป   [   ] (3) ออกให้ครั้งเดียว   [   ] (4) อื่น ๆ (ระบุ) ..............</SafeText>
          </View>

          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ ...box, flex: 1, marginRight: 6 }}>
              <SafeText style={{ fontWeight: "bold" }}>คำเตือน</SafeText>
              <SafeText style={{ fontSize: 7 }}>ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร</SafeText>
            </View>
            <View style={{ ...box, flex: 1 }}>
              <SafeText style={{ fontSize: 8 }}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</SafeText>
              <SafeText style={{ marginTop: 10, textAlign: "center" }}>ลงชื่อ ............................................ ผู้จ่ายเงิน</SafeText>
              <SafeText style={{ marginTop: 6, textAlign: "center" }}>........ / ................ / ..........</SafeText>
              <SafeText style={{ fontSize: 7, textAlign: "center" }}>(วัน เดือน ปี ที่ออกหนังสือรับรองนี้)</SafeText>
            </View>
          </View>

          <SafeText style={{ fontSize: 7 }}>หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง 2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า</SafeText>
        </Page>
      ))}
    </Document>
  );
}
