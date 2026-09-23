import "server-only";
import { View } from "@react-pdf/renderer";
import { ReportPage, SafeText } from "@/lib/pdf/layout";
import type { EmployeeCardData, EmployeeCardSection } from "../employee-reports";

const TBOR7_TOPIC_LABELS = [
  "ความรู้เบื้องต้นเกี่ยวกับธุรกิจรักษาความปลอดภัย",
  "กฎหมายที่เกี่ยวข้องกับการรักษาความปลอดภัย",
  "การรักษาความปลอดภัยขั้นพื้นฐาน",
  "การเขียนรายงาน",
  "การเตรียมพร้อมกรณีเหตุฉุกเฉิน",
  "การติดต่อสื่อสาร",
  "หลักการใช้กำลัง",
  "การปฐมพยาบาลเบื้องต้น",
  "การจัดการจราจร",
  "การฝึกภาคสนาม",
];

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ flexDirection: "row", width: "50%", marginBottom: 3 }}>
      <SafeText style={{ width: 110, color: "#6b7280" }}>{label}</SafeText>
      <SafeText>{value || "-"}</SafeText>
    </View>
  );
}
function SectionTitle({ children }: { children: string }) {
  return <SafeText style={{ fontWeight: "bold", marginTop: 8, marginBottom: 4 }}>{children}</SafeText>;
}

// 2026-09-23 — split into the 6 sections listed by the user, each togglable
// per print run via `sections` (see EMPLOYEE_CARD_SECTIONS in
// employee-reports.ts) so a card can be printed with only what's needed
// (e.g. just ธภ.7 for a licensing renewal). "บริษัท" row removed — it
// duplicated the report's own company-name header line above.
export default function EmployeeCardPdf({ companyName, cards, sections }: { companyName: string; cards: EmployeeCardData[]; sections: Set<EmployeeCardSection> }) {
  return (
    <ReportPage companyName={companyName} title="การ์ดพนักงาน" filterSummary="">
      {cards.map((c, i) => (
        <View key={c.empCode} style={{ marginBottom: 16 }} break={i > 0}>
          <SafeText style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6, borderBottom: "1pt solid #9ca3af", paddingBottom: 4 }}>
            {c.empCode} — {c.title ?? ""} {c.fullName}
          </SafeText>

          {sections.has("EMPLOYEE_INFO") && (
            <>
              <SectionTitle>ข้อมูลพนักงาน</SectionTitle>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <Row label="แผนก" value={c.deptName} />
                <Row label="ตำแหน่ง" value={c.positionName} />
                <Row label="หน่วยงาน" value={c.siteName} />
                <Row label="ประเภทพนักงาน" value={c.employeeType} />
                <Row label="วันเริ่มงาน" value={c.startDate} />
                <Row label="สถานะ" value={c.status} />
                <Row label="ธนาคาร" value={c.bankName} />
                <Row label="เลขบัญชี" value={c.bankAccountNo} />
                <Row label="เลขที่ใบอนุญาต ธภ.6" value={c.licenseNo6} />
                <Row label="ลงวันที่ ธภ.6" value={c.licenseDate6} />
                <Row label="เลขที่ใบอนุญาต ธภ.7" value={c.licenseNo7} />
                <Row label="ลงวันที่ ธภ.7" value={c.licenseDate7} />
              </View>
            </>
          )}

          {sections.has("PERSONAL_INFO") && (
            <>
              <SectionTitle>ข้อมูลส่วนบุคคล</SectionTitle>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                <Row label="เลขบัตรประชาชน" value={c.idCardNo} />
                <Row label="วันเกิด" value={c.birthDate} />
                <Row label="ที่อยู่" value={c.address} />
                <Row label="เบอร์โทร" value={c.phoneNo} />
                <Row label="ผู้ติดต่อฉุกเฉิน" value={c.emergencyContactName} />
                <Row label="เบอร์ฉุกเฉิน" value={c.emergencyContactPhone} />
                <Row label="ผู้ค้ำประกัน" value={c.guarantorName} />
                <Row label="กลุ่มเลือด" value={c.bloodType} />
                <Row label="ส่วนสูง/น้ำหนัก" value={c.height || c.weight ? `${c.height ?? "-"} ซม. / ${c.weight ?? "-"} กก.` : null} />
                <Row label="รูปร่าง" value={c.bodyType} />
                <Row label="เพศ" value={c.gender} />
                <Row label="สัญชาติ" value={c.nationality} />
                <Row label="วุฒิการศึกษา" value={c.education} />
              </View>
            </>
          )}

          {sections.has("WORK_EXPERIENCE") && (
            <View style={{ marginTop: 4 }}>
              <SectionTitle>ประวัติการทำงาน</SectionTitle>
              {c.workExperience.length === 0 ? (
                <SafeText style={{ color: "#9ca3af" }}>- ไม่มีข้อมูล -</SafeText>
              ) : (
                c.workExperience.map((w, j) => (
                  <SafeText key={j} style={{ marginBottom: 1 }}>
                    • {w.companyName} {w.positionName ? `(${w.positionName})` : ""} {w.startDate ?? ""} - {w.endDate ?? "ปัจจุบัน"}
                  </SafeText>
                ))
              )}
            </View>
          )}

          {sections.has("TRAINING_EXPERIENCE") && (
            <View style={{ marginTop: 4 }}>
              <SectionTitle>ประวัติการฝึกอบรม</SectionTitle>
              {c.trainingExperience.length === 0 ? (
                <SafeText style={{ color: "#9ca3af" }}>- ไม่มีข้อมูล -</SafeText>
              ) : (
                c.trainingExperience.map((t, j) => (
                  <SafeText key={j} style={{ marginBottom: 1 }}>
                    • {t.organization} {t.topic ? `— ${t.topic}` : ""} {t.duration ? `(${t.duration})` : ""}
                  </SafeText>
                ))
              )}
            </View>
          )}

          {sections.has("LEAVE_HISTORY") && (
            <View style={{ marginTop: 4 }}>
              <SectionTitle>ประวัติการลาในปี</SectionTitle>
              {c.leaveHistory.length === 0 ? (
                <SafeText style={{ color: "#9ca3af" }}>- ไม่มีข้อมูล -</SafeText>
              ) : (
                c.leaveHistory.map((l, j) => (
                  <SafeText key={j} style={{ marginBottom: 1 }}>
                    • {l.leaveTypeName} {l.startDate} - {l.endDate} ({l.totalDays} วัน)
                  </SafeText>
                ))
              )}
            </View>
          )}

          {sections.has("TBOR7") && (
            <View style={{ marginTop: 4 }}>
              <SectionTitle>ธภ.7 — เช็คลิสต์หลักสูตรฝึกอบรม</SectionTitle>
              {TBOR7_TOPIC_LABELS.map((label, idx) => (
                <SafeText key={idx} style={{ marginBottom: 1 }}>
                  [{c.tbor7Topics[idx] ? "X" : " "}] {idx + 1}. {label}
                </SafeText>
              ))}
              {c.tbor7Remark && <SafeText style={{ marginTop: 2 }}>หมายเหตุ: {c.tbor7Remark}</SafeText>}
            </View>
          )}
        </View>
      ))}
    </ReportPage>
  );
}
