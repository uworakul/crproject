import "server-only";
import { View, Image } from "@react-pdf/renderer";
import { ReportPage, SafeText } from "@/lib/pdf/layout";
import type { EmployeeProfileData } from "../employee-reports";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 3 }}>
      <SafeText style={{ width: 120, color: "#6b7280" }}>{label}</SafeText>
      <SafeText style={{ flex: 1 }}>{value || "-"}</SafeText>
    </View>
  );
}

function LicenseLine({ label, no, date }: { label: string; no: string | null; date: string | null }) {
  const has = !!no;
  return (
    <SafeText style={{ marginBottom: 3 }}>
      {label}: [{has ? "X" : " "}] มี {has ? `เลขที่ ${no} ${date ? `วันที่ ${date}` : ""}` : ""} [{has ? " " : "X"}] ไม่มี
    </SafeText>
  );
}

// ประวัติพนักงาน (2026-09-29) — fixed single-column layout matching the
// legacy "ประวัติพนักงานรักษาความปลอดภัย" template the user uploaded, one
// employee per page (unlike EmployeeCardPdf's toggleable-sections design).
// See getEmployeeProfiles()'s own comment in employee-reports.ts for the
// address-field and license-checkbox mapping decisions.
export default function EmployeeProfilePdf({ companyName, recordedByName, profiles }: { companyName: string; recordedByName: string; profiles: EmployeeProfileData[] }) {
  return (
    <ReportPage companyName={companyName} title="ประวัติพนักงาน" filterSummary="">
      {profiles.map((p, i) => (
        <View key={p.empCode} style={{ marginBottom: 16 }} break={i > 0}>
          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <SafeText style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>
                {p.title ?? ""} {p.firstName ?? ""} {p.lastName ?? p.fullName}
              </SafeText>
              <Field label="รหัสพนักงาน" value={p.empCode} />
              <Field label="ตำแหน่ง" value={p.positionName} />
              <Field label="ส่วนสูง / น้ำหนัก" value={p.height || p.weight ? `${p.height ?? "-"} ซม. / ${p.weight ?? "-"} กก.` : null} />
              <Field label="วันเดือนปี (เกิด)" value={p.birthDate} />
              <Field label="ปัจจุบันอายุ" value={p.age != null ? `${p.age} ปี` : null} />
            </View>
            <View style={{ width: 100, height: 120, border: "1pt solid #9ca3af", alignItems: "center", justifyContent: "center" }}>
              {p.photoDataUri ? (
                <Image src={p.photoDataUri} style={{ width: 100, height: 120, objectFit: "cover" }} />
              ) : (
                <SafeText style={{ color: "#9ca3af", fontSize: 8, textAlign: "center" }}>ไม่มีรูปภาพ</SafeText>
              )}
            </View>
          </View>

          <View style={{ marginTop: 4 }}>
            <Field label="ที่อยู่ตามทะเบียนบ้าน" value={p.permanentAddress} />
            <Field label="ที่อยู่ปัจจุบัน" value={p.currentAddress} />
            <Field label="เบอร์โทรศัพท์" value={p.phoneNo} />
            <Field label="รูปพรรณสัณฐาน" value={p.distinguishingMarks} />
            <Field label="บุคคลอ้างอิง" value={[p.referencePerson1Name, p.referencePerson2Name].filter(Boolean).join(" / ") || null} />
          </View>

          <View style={{ marginTop: 6 }}>
            <SafeText style={{ fontWeight: "bold", marginBottom: 3 }}>การฝึกอบรม</SafeText>
            {p.trainingExperience.length === 0 ? (
              <SafeText style={{ color: "#9ca3af" }}>- ไม่มีข้อมูล -</SafeText>
            ) : (
              p.trainingExperience.map((t, j) => (
                <SafeText key={j} style={{ marginBottom: 1 }}>
                  {j + 1}.{t.organization}
                  {t.topic ? ` — ${t.topic}` : ""}
                  {t.duration ? ` (${t.duration})` : ""}
                </SafeText>
              ))
            )}
          </View>

          <View style={{ marginTop: 6 }}>
            <LicenseLine label="ใบอนุญาต ธภ.6" no={p.licenseNo6} date={p.licenseDate6} />
            <LicenseLine label="ใบอนุญาต ธภ.7" no={p.licenseNo7} date={p.licenseDate7} />
          </View>

          <View style={{ marginTop: 20, alignItems: "flex-end", paddingRight: 20 }}>
            <SafeText style={{ marginBottom: 2 }}>ลงชื่อ .................................... ผู้บันทึก</SafeText>
            <SafeText style={{ marginBottom: 2 }}>({recordedByName})</SafeText>
            <SafeText>ตำแหน่ง ....................................</SafeText>
          </View>
        </View>
      ))}
    </ReportPage>
  );
}
