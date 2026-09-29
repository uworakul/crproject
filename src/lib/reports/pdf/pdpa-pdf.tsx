import "server-only";
import { View } from "@react-pdf/renderer";
import { ReportPage, SafeText } from "@/lib/pdf/layout";
import type { NdaData } from "../employee-reports";

function P({ children, indent = true }: { children: React.ReactNode; indent?: boolean }) {
  return <SafeText style={{ marginBottom: 8, textIndent: indent ? 30 : 0, lineHeight: 1.7, textAlign: "justify" }}>{children}</SafeText>;
}

function Witness() {
  return (
    <View style={{ width: "50%", alignItems: "center", marginBottom: 18 }}>
      <SafeText>ลงชื่อ ......................................... พยาน</SafeText>
      <SafeText>(...........................................)</SafeText>
    </View>
  );
}

// หนังสือให้ความยินยอมในการจัดเก็บเอกสารข้อมูลส่วนบุคคลและข้อมูลที่อ่อนไหว
// (PDPA) — body text follows the paper template the user supplied; company
// name and the consenting employee's name/ID card are pre-filled, the
// signing date and witnesses are left blank for handwriting. Reuses NdaData
// (company name + employee name/ID card is all this form needs).
export default function PdpaPdf({ contracts }: { contracts: NdaData[] }) {
  const company = (d: NdaData) => d.company.name || "...............................";
  return (
    <ReportPage companyName={contracts[0]?.company.name ?? ""} title="หนังสือให้ความยินยอมในการจัดเก็บเอกสาร (PDPA)" filterSummary="">
      {contracts.map((d, i) => (
        <View key={d.employee.empCode} break={i > 0} style={{ fontSize: 11 }}>
          <SafeText style={{ fontSize: 14, fontWeight: "bold", textAlign: "center" }}>หนังสือให้ความยินยอมในการจัดเก็บเอกสาร</SafeText>
          <SafeText style={{ textAlign: "center", marginBottom: 12 }}>ข้อมูลส่วนบุคคลและข้อมูลที่อ่อนไหว /พนักงานและผู้สมัครงานบริษัทฯ</SafeText>
          <View style={{ alignItems: "flex-end", marginBottom: 12 }}>
            <SafeText>เขียนที่ {company(d)}</SafeText>
            <SafeText>วันที่ ..........................................................</SafeText>
          </View>
          <P>
            ด้วยพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 เป็นกฎหมายที่มีเจตนารมณ์ปกป้องการล่วงละเมิดและคุ้มครองสิทธิความเป็นส่วนตัวของข้อมูลส่วนบุคคล ได้กำหนดหลักการให้เก็บรวบรวม ใช้หรือเปิดเผยข้อมูลส่วนบุคคลจะต้องขอความยินยอมพร้อมทั้งแจ้งวัตถุประสงค์ให้เจ้าของข้อมูลส่วนบุคคลทราบโดยชัดแจ้ง
            จะทำเป็นหนังสือหรือทำผ่านระบบอิเล็กทรอนิกส์ก็ได้
          </P>
          <P>
            โดยหนังสือฉบับนี้ {company(d)} มีความประสงค์ขอความยินยอมในการเก็บรวบรวมข้อมูลส่วนบุคคลและข้อมูลที่อ่อนไหวของท่านไว้ โดยข้อมูลในใบสมัครและเอกสารสำคัญอื่นของท่านจะถูกเก็บรักษาไว้ตลอดระยะเวลาการเป็นพนักงาน/ลูกจ้าง และเก็บต่อเนื่องอีกเป็นระยะเวลา 2 ปี
            เพื่อกรณีต้องใช้เป็นหลักฐานประกอบ สำหรับผู้สมัครงานกับบริษัทฯ เพื่อนำไปใช้เป็นเอกสารประกอบการพิจารณารับเข้าทำงานกับบริษัทฯ เพื่อใช้เป็นหลักฐานประกอบการตรวจสอบประวัติอาชญากรรม และนำส่งประวัติของพนักงานประจำหน่วยงานนั้นๆ เพื่อให้เป็นไปตาม พรบ.ธุรกิจรักษาความปลอดภัย 2558
            และข้อกำหนดของพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ.2562
          </P>
          <SafeText style={{ marginBottom: 8, lineHeight: 1.7 }}>
            ข้าพเจ้า {d.employee.displayName} เลขบัตรประจำตัวประชาชน {d.employee.idCardNo}
          </SafeText>
          <P>
            ข้าพเจ้าได้อ่านประกาศของบริษัทฯ เรื่องนโยบายความเป็นส่วนตัวสำหรับผู้สมัครงานเป็นที่เรียบร้อยแล้วจึงยินยอมให้ทางบริษัทฯ เก็บรวบรวม ใช้ เปิดเผยข้อมูลส่วนบุคคลและข้อมูลที่อ่อนไหวของข้าพเจ้า เพื่อใช้ประกอบการพิจารณาในการสมัครงานและเพื่อใช้เป็นหลักฐานในการรับเข้าทำงานร่วมกับบริษัทฯ
            หรือผู้ว่าจ้างตามหน่วยงานนั้นๆ ที่บริษัทฯ เป็นผู้ให้บริการ
          </P>
          <P>ข้าพเจ้าได้อ่านและเข้าใจข้อความดังกล่าวข้างต้นโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน</P>
          <View wrap={false} style={{ marginTop: 20 }}>
            <View style={{ alignItems: "center", marginLeft: 180, marginBottom: 20 }}>
              <SafeText>ลงชื่อ...............................................ผู้ให้ความยินยอม</SafeText>
              <SafeText>( {d.employee.displayName} )</SafeText>
            </View>
            <SafeText style={{ marginBottom: 14 }}>ขอรับรองว่าผู้มีสิทธิให้ความยินยอมได้ให้ความยินยอมต่อหน้าพยานจริง</SafeText>
            <View style={{ flexDirection: "row" }}>
              <Witness />
              <Witness />
            </View>
          </View>
        </View>
      ))}
    </ReportPage>
  );
}
