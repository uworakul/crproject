import "server-only";
import { Document, Page, View } from "@react-pdf/renderer";
import { SafeText, styles, money } from "@/lib/pdf/layout";

// สปส.1-10 ส่วนที่ 2 — laid out like the official form's sheet: 10 employee
// rows per sheet (แผ่นที่ N ในจำนวน M แผ่น), per-sheet รวม, signature block.
// Data-table fidelity, not a pixel-exact reproduction of the government form
// (the user's earlier decision for every government report).
export interface SsoFormRow {
  idCardNo: string;
  fullName: string;
  wage: string;
  contribution: string;
}

const ROWS_PER_SHEET = 10;

const cell = { borderRight: "1pt solid #6b7280", borderBottom: "1pt solid #6b7280", padding: 4, overflow: "hidden" as const };

export default function SsoFormPdf({
  monthLabel,
  companyName,
  accountNo,
  rows,
}: {
  monthLabel: string; // e.g. "กันยายน พ.ศ. 2569"
  companyName: string;
  accountNo: string; // ref_company.SSORegistNo, "" if not set
  rows: SsoFormRow[];
}) {
  const sheets: SsoFormRow[][] = [];
  for (let i = 0; i < rows.length; i += ROWS_PER_SHEET) sheets.push(rows.slice(i, i + ROWS_PER_SHEET));
  if (sheets.length === 0) sheets.push([]);

  return (
    <Document>
      {sheets.map((sheetRows, sheetIdx) => {
        const wageTotal = sheetRows.reduce((s, r) => s + Number(r.wage), 0);
        const contribTotal = sheetRows.reduce((s, r) => s + Number(r.contribution), 0);
        const padded: (SsoFormRow | null)[] = [...sheetRows, ...Array(ROWS_PER_SHEET - sheetRows.length).fill(null)];
        return (
          <Page key={sheetIdx} size="A4" orientation="landscape" style={styles.page}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
              <View>
                <SafeText style={{ fontSize: 13, fontWeight: "bold" }}>รายละเอียดการนำส่งเงินสมทบ</SafeText>
                <SafeText>สำหรับค่าจ้างเดือน {monthLabel}</SafeText>
                <SafeText>ชื่อสถานประกอบการ {companyName}</SafeText>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <SafeText style={{ fontSize: 13, fontWeight: "bold" }}>สปส.1-10 ส่วนที่ 2</SafeText>
                <SafeText>
                  แผ่นที่ {sheetIdx + 1} ในจำนวน {sheets.length} แผ่น
                </SafeText>
                <SafeText>เลขที่บัญชี {accountNo || "-"}</SafeText>
                <SafeText>ลำดับที่สาขา ................</SafeText>
              </View>
            </View>

            <View style={{ borderTop: "1pt solid #6b7280", borderLeft: "1pt solid #6b7280" }}>
              <View style={{ flexDirection: "row", backgroundColor: "#f3f4f6" }}>
                <View style={{ ...cell, flex: 1 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>ลำดับที่</SafeText>
                </View>
                <View style={{ ...cell, flex: 3 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>เลขประจำตัวประชาชน</SafeText>
                  <SafeText style={{ fontSize: 7, textAlign: "center" }}>(สำหรับคนต่างด้าวให้กรอกเลขที่บัตรประกันสังคม)</SafeText>
                </View>
                <View style={{ ...cell, flex: 4 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>คำนำหน้านาม-ชื่อ-ชื่อสกุล</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>ค่าจ้างที่จ่ายจริง</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "center" }}>เงินสมทบผู้ประกันตน</SafeText>
                </View>
              </View>
              {padded.map((r, i) => (
                <View key={i} style={{ flexDirection: "row", minHeight: 22 }}>
                  <View style={{ ...cell, flex: 1 }}>
                    <SafeText style={{ textAlign: "center" }}>{r ? sheetIdx * ROWS_PER_SHEET + i + 1 : ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 3 }}>
                    <SafeText style={{ textAlign: "center" }}>{r?.idCardNo ?? ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 4 }}>
                    <SafeText>{r?.fullName ?? ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 2 }}>
                    <SafeText style={{ textAlign: "right" }}>{r ? money(r.wage) : ""}</SafeText>
                  </View>
                  <View style={{ ...cell, flex: 2 }}>
                    <SafeText style={{ textAlign: "right" }}>{r ? money(r.contribution) : ""}</SafeText>
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: "row", backgroundColor: "#f9fafb" }}>
                <View style={{ ...cell, flex: 8 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>รวม</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>{money(wageTotal)}</SafeText>
                </View>
                <View style={{ ...cell, flex: 2 }}>
                  <SafeText style={{ fontWeight: "bold", textAlign: "right" }}>{money(contribTotal)}</SafeText>
                </View>
              </View>
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 10 }}>
              <View style={{ flex: 3 }}>
                <SafeText style={{ fontSize: 7, fontWeight: "bold" }}>คำชี้แจง</SafeText>
                <SafeText style={{ fontSize: 7 }}>
                  1. ให้นายจ้างยื่นแบบ สปส.1-10 ทั้ง 2 ส่วน และนำส่งเงินสมทบภายในวันที่ 15 ของเดือนถัดจากเดือนที่มีการหักเงินสมทบไว้ มิฉะนั้นจะต้องจ่ายเงินเพิ่มร้อยละ 2 ต่อเดือน ตั้งแต่วันที่ 16 ของเดือนที่ต้องนำส่ง
                </SafeText>
                <SafeText style={{ fontSize: 7 }}>2. สำหรับผู้ประกันตนที่เป็นคนต่างด้าว ให้กรอกเลขที่บัตรประกันสังคมในช่องเลขประจำตัวประชาชน</SafeText>
                <SafeText style={{ fontSize: 7 }}>
                  3. เงินสมทบแต่ละคน หากมีเศษสตางค์ตั้งแต่ 50 สตางค์ขึ้นไปให้ปัดเป็น 1 บาท ถ้าน้อยกว่า 50 สตางค์ให้ปัดทิ้ง
                </SafeText>
              </View>
              <View style={{ flex: 2, marginLeft: 20 }}>
                <SafeText>ลงชื่อ .................................................. นายจ้าง</SafeText>
                <SafeText style={{ marginTop: 6 }}>ตำแหน่ง ..................................................</SafeText>
                <SafeText style={{ marginTop: 6 }}>ยื่นแบบวันที่ ........ เดือน .................... พ.ศ. ..........</SafeText>
              </View>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
