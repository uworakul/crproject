import "server-only";
import { View, Image } from "@react-pdf/renderer";
import { ReportPage, SafeText } from "@/lib/pdf/layout";
import type { Tbor6Data } from "../employee-reports";

// One underlined fill-in field: "label value" with the value sitting on a
// dotted line, like the paper form.
function F({ label, value, flex = 1 }: { label: string; value?: string | number | null; flex?: number }) {
  return (
    <View style={{ flexDirection: "row", flex, alignItems: "flex-end", marginRight: 6 }}>
      <SafeText>{label} </SafeText>
      <View style={{ flex: 1, borderBottom: "1pt dotted #6b7280", minHeight: 14 }}>
        <SafeText style={{ fontWeight: "bold" }}>{value === null || value === undefined ? "" : String(value)}</SafeText>
      </View>
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", marginBottom: 6 }}>{children}</View>;
}

// 13-digit ID card shown as boxes grouped 1-4-5-2-1, like the form.
function IdBoxes({ id }: { id: string }) {
  const digits = id.replace(/\D/g, "").padEnd(13, " ").slice(0, 13).split("");
  const groups = [1, 4, 5, 2, 1];
  let pos = 0;
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {groups.map((n, gi) => {
        const part = digits.slice(pos, pos + n);
        pos += n;
        return (
          <View key={gi} style={{ flexDirection: "row", alignItems: "center" }}>
            {gi > 0 && <SafeText>-</SafeText>}
            {part.map((d, i) => (
              <View key={i} style={{ width: 14, height: 15, border: "1pt solid #111827", alignItems: "center", justifyContent: "center", marginRight: 1 }}>
                <SafeText style={{ fontWeight: "bold" }}>{d.trim()}</SafeText>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Check({ on, children }: { on?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", marginBottom: 4, paddingRight: 10 }}>
      <SafeText>({on ? " / " : "........."}) </SafeText>
      <SafeText style={{ flex: 1 }}>{children}</SafeText>
    </View>
  );
}

function Blank({ children }: { children: React.ReactNode }) {
  return <SafeText style={{ marginBottom: 4 }}>{children}</SafeText>;
}

const DOTS_LONG = "..............................................................................................................................";

export default function Tbor6Pdf({ forms }: { forms: Tbor6Data[] }) {
  return (
    <ReportPage companyName={forms[0]?.company.name ?? ""} title="แบบ ธภ.6 คำขอรับใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต" filterSummary="">
      {forms.map((f, i) => {
        const p = f.addressParts;
        const c = f.company;
        const hasParts = Object.values(p).some(Boolean);
        return (
          <View key={i} break={i > 0} style={{ fontSize: 10.5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
              <SafeText style={{ fontSize: 13, fontWeight: "bold" }}>ส่วนที่ ๑ (สำหรับผู้ยื่นคำขอ)</SafeText>
              <View style={{ alignItems: "flex-end" }}>
                <SafeText style={{ fontSize: 13, fontWeight: "bold", marginBottom: 2 }}>แบบ ธภ.๖</SafeText>
                <View style={{ width: 75, height: 95, border: "1pt solid #111827", alignItems: "center", justifyContent: "center" }}>
                  {f.photoDataUri ? <Image src={f.photoDataUri} style={{ width: 75, height: 95, objectFit: "cover" }} /> : <SafeText style={{ color: "#9ca3af", fontSize: 8 }}>ไม่มีรูปภาพ</SafeText>}
                </View>
              </View>
            </View>

            <SafeText style={{ fontSize: 13, fontWeight: "bold", textAlign: "center", marginBottom: 10 }}>คำขอรับใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต</SafeText>

            <View style={{ alignItems: "flex-end", marginBottom: 8, width: "65%", alignSelf: "flex-end" }}>
              <View style={{ width: "100%" }}>
                <Row>
                  <F label="เขียนที่" value={c.name} />
                </Row>
                <Row>
                  <F label="วันที่" value="" />
                  <F label="เดือน" value="" />
                  <F label="พ.ศ." value="" />
                </Row>
              </View>
            </View>

            <Row>
              <F label="๑. ข้าพเจ้า ชื่อ" value={f.applicantName} flex={3} />
              <F label="อายุ" value={f.age} flex={0.8} />
              <F label="ปี สัญชาติ" value={f.nationality} flex={1.2} />
              <F label="หมู่เลือด" value={f.bloodType} flex={1} />
            </Row>
            <Row>
              <SafeText>เลขที่บัตรประจำตัวประชาชน </SafeText>
              <IdBoxes id={f.idCardNo} />
            </Row>
            {hasParts ? (
              <>
                <Row>
                  <F label="เลขที่" value={p.houseNo} />
                  <F label="หมู่" value={p.moo} />
                  <F label="ซอย/ตรอก" value={p.soi} />
                  <F label="ถนน" value={p.road} />
                  <F label="แขวง/ตำบล" value={p.tambon} />
                </Row>
                <Row>
                  <F label="เขต/อำเภอ" value={p.amphoe} />
                  <F label="จังหวัด" value={p.province} />
                  <F label="โทรศัพท์" value={f.phoneNo} />
                </Row>
              </>
            ) : (
              <Row>
                <F label="ที่อยู่" value={f.addressFallback} flex={3} />
                <F label="โทรศัพท์" value={f.phoneNo} />
              </Row>
            )}
            <Row>
              <F label="เป็นพนักงานรักษาความปลอดภัยของ บริษัท" value={c.name} />
            </Row>
            <Row>
              <F label="ใบอนุญาตประกอบธุรกิจรักษาความปลอดภัย เลขที่" value={c.licenseNo} />
            </Row>
            <Row>
              <F label="ตั้งอยู่ อาคาร" value="" />
              <F label="ชั้นที่" value="" />
              <F label="เลขที่" value={c.addressParts.houseNo} />
              <F label="หมู่ที่" value={c.addressParts.moo} />
            </Row>
            <Row>
              <F label="ซอย/ตรอก" value={c.addressParts.soi} />
              <F label="ถนน" value={c.addressParts.road} />
              <F label="แขวง/ตำบล" value={c.addressParts.tambon} />
            </Row>
            <Row>
              <F label="เขต/อำเภอ" value={c.addressParts.amphoe} />
              <F label="จังหวัด" value={c.addressParts.province} />
              <F label="รหัสไปรษณีย์" value={c.addressParts.zipCode} />
              <F label="โทรศัพท์" value={c.phone} />
            </Row>

            <SafeText style={{ fontWeight: "bold", marginTop: 4, marginBottom: 4 }}>มีความประสงค์จะยื่นคำขอ</SafeText>
            <Check on>ใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต</Check>
            <Check>ขอต่ออายุใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต</Check>
            <Check>ขอแก้ไขสาระสำคัญในใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต ได้แก่ ขอเปลี่ยนชื่อ สกุล บริษัท ที่สังกัด</Check>
            <Check>ขอรับใบแทนใบอนุญาต ในกรณี ใบอนุญาตสูญหาย หรือ ชำรุด ในสาระสำคัญ</Check>

            <View break>
              <SafeText style={{ fontWeight: "bold", marginBottom: 4 }}>พร้อมคำขอนี้ ข้าพเจ้าแนบเอกสาร หลักฐานมาเพื่อประกอบการพิจารณา ดังนี้</SafeText>
            </View>
            <Check on>สำเนาหรือภาพถ่าย บัตรประจำตัวประชาชน</Check>
            <Check on>สำเนาหรือภาพถ่าย ทะเบียนบ้าน</Check>
            <Check on>รูปถ่ายครึ่งตัว หน้าตรงไม่สวมหมวกและแว่นตาดำ ขนาด ๑ นิ้ว จำนวน ๓ รูป</Check>
            <Check on>สำเนาหรือภาพถ่ายวุฒิการศึกษาสูงสุด ว่าด้วยการศึกษาภาคบังคับ</Check>
            <Check on>หนังสือรับรองผ่านการอบรม หลักสูตรการรักษาความปลอดภัยจากสถาบันที่อบรมที่นายทะเบียนกลางรับรอง</Check>
            <Check on>ใบรับรองแพทย์ ว่าไม่เป็นโรคพิษสุราเรื้อรังหรือติดยาเสพติดให้โทษหรือเป็นโรคติดต่อที่คณะกรรมการกำหนด</Check>
            <View style={{ marginTop: 4 }}>
              <SafeText style={{ marginBottom: 4, lineHeight: 1.5 }}>๒. ข้าพเจ้าขอรับรองว่าไม่ได้เป็นคนวิกลจริตหรือจิตฟั่นเฟือนไม่สมประกอบ คนไร้ความสามารถหรือเสมือน ไร้ความสามารถ</SafeText>
              <SafeText style={{ marginBottom: 4, lineHeight: 1.5 }}>
                ๓. ข้าพเจ้าขอรับรองว่า ไม่เคยได้รับโทษโดยคำพิพากษาถึงที่สุดให้จำคุกสำหรับความผิดเกี่ยวกับชีวิตและร่างกาย ความผิดเกี่ยวกับทรัพย์ หรือความผิดเกี่ยวกับเพศตามประมวลกฎหมายอาญา ความผิดตามกฎหมายว่าด้วยการพนัน หรือความผิดเกี่ยวกับยาเสพติด
                เว้นแต่เป็นโทษสำหรับความผิดที่ได้กระทำโดยประมาทหรือความผิดลหุโทษ หรือพ้นโทษมาแล้วไม่น้อยกว่าสามปีก่อนวันขอรับใบอนุญาตและมิใช่ความผิดเกี่ยวกับเพศตามประมวลกฎหมายอาญา
              </SafeText>
              <SafeText style={{ marginBottom: 8, lineHeight: 1.5 }}>
                ๔. ข้าพเจ้าขอรับรองว่า ไม่เคยถูกเพิกถอนใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาตมาแล้วยังไม่ถึงสองปีนับถึงวันยื่นคำขอรับใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาต
              </SafeText>
              <SafeText style={{ textAlign: "center", marginBottom: 16 }}>ข้าพเจ้าขอรับรองว่า ข้อความและรายการตามคำขอนี้ถูกต้องเป็นความจริงทุกประการ</SafeText>
            </View>
            <View wrap={false} style={{ alignItems: "flex-end", marginBottom: 12 }}>
              <SafeText>(ลงชื่อ)........................................................................ผู้ยื่นคำขอ</SafeText>
              <SafeText>( {f.applicantName} )</SafeText>
            </View>
            <SafeText style={{ lineHeight: 1.5, marginBottom: 14 }}>
              <SafeText style={{ fontWeight: "bold" }}>หมายเหตุ</SafeText> สำเนาแบบ ธภ.๖ ที่นายทะเบียนรับรองสำเนา ให้ถือเป็นใบแทนใบอนุญาต ในกรณีอยู่ระหว่างการยื่นคำร้องขอต่ออายุใบอนุญาตหรือขอแก้ไขสาระสำคัญหรือกรณีใบอนุญาตสูญหายหรือชำรุดในสาระสำคัญ และให้ผู้ยื่นคำขอพกติดตัวตลอดเวลาที่ปฏิบัติหน้าที่หรือเมื่อเจ้าหน้าที่ตำรวจเรียกขอตรวจสอบ
            </SafeText>

            <View break>
              <View style={{ alignItems: "flex-end" }}>
                <SafeText style={{ fontSize: 13, fontWeight: "bold", marginBottom: 6 }}>แบบ ธภ.๖</SafeText>
              </View>
              <SafeText style={{ fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>ส่วนที่ ๒ (สำหรับเจ้าหน้าที่)</SafeText>
              <SafeText style={{ fontWeight: "bold", marginBottom: 3 }}>๑. การตรวจสอบคุณสมบัติของผู้ยื่นคำขอ ตามมาตรา ๓๔ ก. (๑)-(๔) และ ข.(๑)</SafeText>
              <Blank>เอกสารที่ยื่นประกอบคำขอ ส่วนที่ ๑</Blank>
              <Blank>(.........) ครบ</Blank>
              <Blank>(.........) ไม่ครบ เนื่องจาก{DOTS_LONG.slice(0, 80)}</Blank>
              <SafeText style={{ fontWeight: "bold", marginTop: 6, marginBottom: 3 }}>๒. การตรวจสอบคุณสมบัติของผู้ยื่นคำขอตาม มาตรา ๓๔ ข.(๒)</SafeText>
              <Blank>(.........) เป็น</Blank>
              <Blank>(.........) ไม่เป็น คนวิกลจริตหรือจิตฟั่นเฟือนไม่สมประกอบ คนไร้ความสามารถหรือคนเสมือนไร้ความสามารถ</Blank>
              <SafeText style={{ fontWeight: "bold", marginTop: 6, marginBottom: 3 }}>๓. การตรวจสอบคุณสมบัติของผู้ยื่นคำขอ ตามมาตรา ๓๔ ข.(๓)</SafeText>
              <SafeText style={{ lineHeight: 1.5, marginBottom: 4 }}>โดยนายทะเบียนได้มีหนังสือ ขอความร่วมมือในการตรวจสอบประวัติการต้องโทษของผู้ยื่นคำขอพร้อมพิมพ์ลายนิ้วมือ ตามหนังสือที่..............................................ลงวันที่..............................................จาก..............................................</SafeText>
              <Blank>ถึง กองทะเบียนประวัติอาชญากร จังหวัด..............................................................................</Blank>
              <Blank>ผลการตรวจสอบปรากฏว่า</Blank>
              <Blank>(.........) ไม่พบ</Blank>
              <Blank>(.........) พบ ประวัติการต้องโทษ อันทำให้คุณสมบัติของผู้ยื่นคำขอไม่สมบูรณ์ตามมาตรา ๓๔ ข(๓)</Blank>
              <SafeText style={{ fontWeight: "bold", marginTop: 6, marginBottom: 3 }}>๔. การตรวจสอบคุณสมบัติผู้ยื่นคำขอ ตามมาตรา ๓๔ ข.(๔)</SafeText>
              <Blank>(.........) ไม่เคย</Blank>
              <Blank>(.........) เคย ถูกเพิกถอนใบอนุญาตเป็นพนักงานรักษาความปลอดภัยรับอนุญาตมาแล้วยังไม่ถึงสองปีนับถึงวันยื่นคำขอรับใบอนุญาตเป็นพนักงานรักษาความปลอดภัยอนุญาต</Blank>
              <Blank>รับคำขอวันที่..............................เดือน..........................................พ.ศ...................</Blank>
              <SafeText style={{ lineHeight: 1.5, marginBottom: 4 }}>
                (.........) ครบกำหนด <SafeText style={{ fontWeight: "bold" }}>สามสิบวันนับแต่วันรับคำขอ</SafeText> (กรณีตาม มาตรา ๓๘ หรือในกรณีขอแก้ไขสาระสำคัญในใบอนุญาตเป็นพนักงานรักษาความปลอดภัยอนุญาต ซึ่งสาระสำคัญที่ขอเปลี่ยนแปลงได้แก่ ชื่อ สกุล บริษัทที่สังกัด แล้วแต่กรณี)
              </SafeText>
              <Blank>
                (.........) ครบกำหนด <SafeText style={{ fontWeight: "bold" }}>หกสิบวันนับแต่วันรับคำขอ</SafeText> (กรณีตาม มาตรา ๓๕, ๓๗ วรรคสอง)
              </Blank>
              <Blank>ในวันที่...................เดือน.........................................พ.ศ.........................</Blank>
              <SafeText style={{ textAlign: "center", fontSize: 12, marginTop: 10, marginBottom: 6, borderTop: "1pt solid #111827", paddingTop: 6 }}>คำสั่งนายทะเบียน</SafeText>
              <Blank>{DOTS_LONG}</Blank>
              <Blank>{DOTS_LONG}</Blank>
              <Blank>{DOTS_LONG}</Blank>
              <View style={{ alignItems: "flex-end", marginTop: 12 }}>
                <SafeText>(ลงชื่อ)....................................................นายทะเบียน</SafeText>
                <SafeText>(....................................................)</SafeText>
                <SafeText>ตำแหน่ง....................................................</SafeText>
                <SafeText>............../........../.............</SafeText>
              </View>
            </View>
          </View>
        );
      })}
    </ReportPage>
  );
}
