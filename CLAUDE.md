# CLAUDE.md — ABC CO.,LTD. HR & Payroll System (New Build)

## บริบทโปรเจกต์

ระบบ HR & Payroll ใหม่ทั้งระบบของ **ABC CO., LTD.** (ธุรกิจรักษาความปลอดภัย/จัดหา รปภ. ให้ลูกค้าหลายหน่วยงาน — **ไม่ใช่ธุรกิจอาหารตามที่เอกสารรุ่นก่อนหน้าเข้าใจผิดว่าเป็น "Health Foods Corporation"** ยืนยันแก้ไขแล้วเมื่อ 2026-09-15; ชื่อบริษัทแก้ไขล่าสุดเป็น "ABC CO., LTD." ตามที่ผู้ใช้ระบุ) พัฒนาเป็น **Web Application ใหม่ทั้งหมด** เพื่อทดแทนโปรแกรม CRPAYROLL เดิม (Desktop/Legacy) ที่เลิกใช้งานแล้ว — **ไม่มีระบบเดิมให้เชื่อมต่อหรือ Migrate ข้อมูลจาก** ระบบใหม่เป็นเจ้าของข้อมูลทั้งหมดโดยตรงตั้งแต่เริ่มต้น

หมายเหตุ: เอกสาร/ไฟล์เดิมทั้งหมดยังใช้ชื่อรหัสโปรเจกต์ขึ้นต้นด้วย `HFC_` (เช่น `HFC_CRPAYROLL_BRD.xlsx`) — เป็นแค่ชื่อรหัสไฟล์ ไม่ต้องเปลี่ยนชื่อไฟล์ตาม แต่เนื้อหา/บริบททางธุรกิจให้ยึดตามธุรกิจรักษาความปลอดภัยจริง (เช่น "REGULAR/SPARE" ในตาราง Worksheet = รปภ.ประจำ/รปภ.สแปร์, "Site" = หน่วยงาน/จุดปฏิบัติงานของลูกค้า)

ครอบคลุม 9 โมดูล: ผู้ใช้งานและสิทธิ์, ตั้งค่าระบบ/รหัสอ้างอิง, ข้อมูลหลักพนักงาน, การขออนุมัติ (เบิกล่วงหน้า/เงินกู้/ค่าอบรม), สินค้าคงคลัง/เครื่องแบบ, คำนวณและจ่ายเงินเดือน, การลา, ข้อกำหนดทางเทคนิค, และใบลงเวลาปฏิบัติงาน (Worksheet — จุดเริ่มต้นของโปรเจกต์นี้)

## สถานะปัจจุบัน (ณ วันที่จัดทำเอกสาร)

- [x] BRD (Business Requirements) — `HFC_CRPAYROLL_BRD.xlsx`
- [x] FSD (Functional Specification) — `HFC_CRPAYROLL_FSD.docx`
- [x] Site Map ทั้ง 9 โมดูล — `CRPAYROLL_Site_Map.html`
- [x] UI Mockup หน้าจอ Worksheet — `Worksheet_Design_Mockup.html`
- [x] **Database Design ทั้ง 9 โมดูล (33 ตาราง)** — `HFC_System_Database_Design.docx` (มี Data Dictionary + ER Diagram)
- [x] **DDL Script พร้อมรัน** — `HFC_System_Database_DDL.sql`
- [x] **Prisma schema + migration เข้า DB จริงแล้ว** (2026-09-15) — `prisma/schema.prisma` (34 ตาราง), migration แรกรันผ่าน `CRPAYROLL_007` สำเร็จ (ตรวจแล้ว: 34 ตาราง+_prisma_migrations, 13 CHECK constraints, 46 FK, ROWVERSION ถูกที่), ติดตั้ง `@prisma/adapter-mssql` (Prisma 7 บังคับใช้ driver adapter)
- [ ] **ยังไม่เริ่มเขียน Next.js app** — ต่อไปคือ scaffold โครงสร้าง App Router + Route Handlers

ไฟล์ทั้งหมดข้างต้นอยู่ในโฟลเดอร์ย่อย `documents/` ภายใต้โฟลเดอร์นี้ (D:\CRPROJECT\documents) — เปิดอ่านเพื่อดูรายละเอียด Requirement/Design แบบเต็มก่อนเริ่มเขียนโค้ดทุกครั้ง

## Technology Stack

**อัปเดต 2026-09-15**: เปลี่ยนจาก Node.js+Express แยก backend เป็น **Next.js Full-stack** ตามที่ผู้ใช้ยืนยันแล้ว (แทนที่ Technology Stack เดิมทั้งหมดในหัวข้อนี้)

- **Framework**: Next.js (App Router) แบบ Full-stack — ไม่มี Express แยกต่างหาก ใช้ Route Handlers (`app/api/**/route.ts`) เป็น API Layer โดยตรง
- **ORM**: Prisma (provider `sqlserver`)
- **Database**: Microsoft SQL Server — ได้รับ Connection Info แล้ว (2026-09-15), เก็บใน `.env` local เท่านั้น (**ห้าม commit ค่าจริงเข้า git — repo นี้เป็น public**), ดูรูปแบบตัวแปรที่ `.env.example`. ทดสอบ login สำเร็จแล้ว, DB ชื่อ `CRPAYROLL_007` ว่างเปล่า (ยังไม่ได้รัน DDL) — ⚠️ **เครื่องจริงเป็น SQL Server 2014 (SP3)** แต่ DDL script คอมเมนต์ไว้ว่าต้องการ 2019+ (ตรวจ syntax แล้วไม่พบฟีเจอร์เฉพาะรุ่นใหม่ น่าจะรันได้ปกติ แต่ 2014 หมด Extended Support แล้ว — ความเสี่ยงด้าน security patching ที่ควรแจ้งผู้ใช้ทราบ ไม่ใช่เรื่องที่ควรเดาแก้เอง)
- **Frontend**: Next.js + React + TypeScript, Responsive Design (ยึดตาม `Worksheet_Design_Mockup.html` เป็นต้นแบบ UI)
- **Authentication**: Session/Cookie-based (ยืนยันแล้วโดยผู้ใช้ 2026-09-15) — **กลไกจัดเก็บ session (DB-backed table vs. encrypted cookie) ยังไม่ได้อนุมัติ ต้องเสนอทางเลือกและรออนุมัติก่อนเพิ่มเข้า schema**
- **Language**: TypeScript ตลอดทั้งโปรเจกต์ (Next.js + Prisma)
- **Integration (อนาคต)**: Google Workspace (Gmail/Drive/Sheets), Gemini AI, n8n Workflow — ยังไม่ใช่ scope ของรอบพัฒนาแรก

## Database — สรุปสำคัญ

33 ตารางเดิม + 1 ตารางใหม่ที่อนุมัติเพิ่มเมื่อ 2026-09-15 (`sys_session`, รองรับ Session/Cookie Auth) = 34 ตาราง แบ่งตามโมดูล (รายละเอียดเต็มดู `HFC_System_Database_Design.docx` และ `HFC_System_Database_DDL.sql` — DDL ยังไม่มี `sys_session` ต้องเพิ่มเองใน `schema.prisma`/migration):

| โมดูล | ตาราง | หมายเหตุ |
|---|---|---|
| 1. User & Authorization | sys_user, sys_menu, sys_user_permission, **sys_session** (ใหม่) | สิทธิ์แยกตาม DocumentType + SiteCode ได้; sys_session = DB-backed session (SessionID/UserID/CreatedDate/ExpiresDate/LastActivityDate) รองรับ force logout |
| 2. System Settings | sys_period, sys_process_log, ref_bank, ref_department, ref_position, ref_sso_base, ref_black_list, ref_tax_bracket, ref_deduction_rate | ตารางอ้างอิง/Audit log |
| 3. Employee Master | mst_employee, mst_employee_quota, mst_employee_history | ตารางหลักที่ทุกโมดูลอ้างอิง |
| 4. Request & Approve | trn_request | **รวม** Advance/Loan/Training ไว้ตารางเดียว แยกด้วย `RequestType` |
| 5. Inventory | inv_supplier, inv_warehouse, inv_product, inv_stock_movement, inv_stock_movement_detail, inv_employee_debt | **Ledger กลาง** `inv_stock_movement` รวมทุกประเภทการเคลื่อนไหว แยกด้วย `MovementType`; ไม่มีระบบภายนอก "Express" ให้เชื่อมต่อ (ยืนยันแล้ว 2026-09-15 — บันทึกใน BRD เป็นข้อมูลเก่าที่ไม่เกี่ยวข้อง) |
| 6. Payroll | mst_site, trn_payroll_transaction, trn_payroll_calculate_log, trn_payroll_lock | ปลายทาง Auto-post จาก Worksheet |
| 7. Leave | mst_leave_type, trn_leave_request, mst_employee_leave_balance | |
| 9. Worksheet | mst_attendance_code, trn_worksheet_header, trn_worksheet_detail, trn_worksheet_daily | **จุดเริ่มต้นโปรเจกต์** — Auto-post เข้า trn_payroll_transaction เมื่อ Approve |

**Design Decision สำคัญที่อนุมัติแล้ว** (อย่าเปลี่ยนโดยไม่ปรึกษาก่อน):
1. `trn_request` เป็นตารางรวม ไม่แยกตาราง Advance/Loan/Training — Approve แล้วอัปเดต `mst_employee_quota.QuotaUsed` อัตโนมัติ
2. `inv_stock_movement` เป็น Ledger กลาง ไม่แยกตารางตามประเภทเอกสาร
3. `trn_worksheet_header/detail` มีคอลัมน์ `RowVer` (ROWVERSION) ป้องกัน Concurrent Update — เอกสาร Performance Notes แนะนำให้ใช้กับ `trn_request`/`trn_leave_request` ด้วย แต่ยังไม่ได้อนุมัติเพิ่มคอลัมน์นี้ในตารางทั้งสอง — **ต้องถามผู้ใช้ก่อนเพิ่ม**
4. ตารางที่โตเร็ว (`trn_worksheet_daily`, `inv_stock_movement_detail`, `sys_process_log`) ยังไม่มี Partitioning — พิจารณาเพิ่มเมื่อข้อมูลจริงเข้าใกล้หลักล้านแถว

## กฎการทำงานที่ต้องยึดถือ (จากความต้องการของผู้ใช้)

1. **ห้ามเดาหรือสมมติข้อมูลสำคัญ** — ถ้าข้อมูลไม่ครบ (เช่น VPS IP, Connection String, ชื่อ Field ที่ไม่ชัดเจน) ให้หยุดถามก่อนเสมอ
2. **วิเคราะห์ก่อนเขียนโค้ดทุกครั้ง** — สรุปเป้าหมาย/ปัญหา/ตารางที่เกี่ยวข้อง/ความเสี่ยง ก่อนลงมือ
3. **เสนอทางเลือกอย่างน้อย 2 ทาง พร้อมข้อดีข้อเสีย** สำหรับการตัดสินใจเชิงสถาปัตยกรรม
4. **รออนุมัติก่อนเขียนโค้ดเสมอ** (Step 5 ก่อน Step 6 ของ Workflow)
5. **Next.js Coding Standards**: async/await, แยกชั้น Route Handler (`app/api/**/route.ts`) / Service / Repository (Prisma) / Config ให้ชัดเจน, Environment Variables ผ่าน `.env`, Error Handling กลาง (รูปแบบ error response มาตรฐาน `{error, message}` ตาม FSD), Logging ทุก Transaction สำคัญ (เชื่อมกับ `sys_process_log`)
6. **ออกแบบแบบ Enterprise**: คำนึงถึง Security, Scalability, Maintainability, Performance, Data Integrity เสมอ
7. ทุกคำตอบต้องอธิบายเหตุผลประกอบ และมองภาพรวมทั้งระบบ (ฝ่ายขาย/ผลิต/จัดซื้อ/คลัง/บัญชี/ผู้บริหาร)

## ขั้นตอนถัดไปที่แนะนำ

1. รัน `HFC_System_Database_DDL.sql` บน SQL Server ใหม่ (ต้องมี Connection Info ก่อน — ถามผู้ใช้)
2. ตัดสินใจกลไก Session storage (DB table vs encrypted cookie) แล้ว Scaffold โครงสร้าง Next.js (App Router) + Prisma schema
3. ออกแบบ API ตาม FSD (Endpoint/Method/Request/Response/Error Handling ตามฟอร์แมตที่กำหนด) — เริ่มจากโมดูล Worksheet ก่อนเพราะมี UI Mockup พร้อมแล้ว
4. เชื่อม Frontend ตาม UI Mockup ที่ออกแบบไว้ (`Worksheet_Design_Mockup.html`)

## ประเด็นที่ต้องติดตาม / ยังไม่ปิด (พบระหว่างอ่านเอกสารรอบ 2026-09-15)

- **worksheet.xlsx มีข้อมูลพนักงานจริง (PII)** — ชื่อ/ค่าแรง/ตารางกะ/ยอดเบิกจริงของพนักงาน รปภ. — **ห้าม commit ข้อมูลนี้ตรงๆ เป็น seed/sample data** ต้อง anonymize ก่อนเสมอ
- `manual.pdf` อ่านไม่ได้ในเครื่องนี้ (ขาด poppler-utils) — ไม่กระทบ scope เพราะเป็นคู่มือระบบเก่าที่ไม่ migrate
- Performance Notes เสนอเพิ่มเติมที่ยังไม่อนุมัติ: (1) นโยบาย archive `sys_process_log` เก่ากว่า N ปี — ยังไม่กำหนด N, (2) View/ตารางสรุปรายเดือนสำหรับ `trn_payroll_transaction` รองรับรายงาน 30+ ตัว, (3) Application-level cache สำหรับตาราง `ref_*`/`mst_*` — ทั้งสามข้อต้องเสนอทางเลือกและรออนุมัติก่อนทำ

## Version

- เอกสารนี้ตรงกับ HFC_System_Database_Design.docx v1.0 (15/09/2026)
- สถานะ: Database Design อนุมัติแล้ว, Technology Stack ยืนยันเป็น Next.js Full-stack + Prisma 7.10.0 (pinned, ไม่ใช้ 8.0.0-rc) + MSSQL + Session/Cookie Auth ผ่าน `sys_session` (2026-09-15). Prisma schema + migration ประยุกต์เข้า DB จริงสำเร็จแล้ว (`CRPAYROLL_007`). ขั้นถัดไป: scaffold Next.js App Router
