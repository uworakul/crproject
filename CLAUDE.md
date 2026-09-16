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

## Next.js 16 — จุดที่ต่างจาก training data ของ AI (สำคัญ อ่านก่อนเขียน route/auth code)

Next.js เองเคยแทรกคำเตือนอัตโนมัติท้ายไฟล์นี้ตอนรัน `next dev` ว่าเวอร์ชันนี้มี breaking changes จาก training data ของ AI — ปิดฟีเจอร์นี้แล้ว (`agentRules: false` ใน `next.config.ts`) เพราะมันไปรบกวนเนื้อหาไฟล์นี้เอง (ดู "เหตุการณ์ที่ต้องระวัง" ด้านล่าง) แต่คำแนะนำยังใช้ได้ ตรวจสอบแล้วพบ breaking changes จริงดังนี้ (อ้างอิง `node_modules/next/dist/docs/`):

1. **`middleware.ts` ถูกเปลี่ยนชื่อเป็น `proxy.ts`** (file convention ใหม่ ทำหน้าที่เดิม)
2. **Dynamic APIs เป็น async ทั้งหมด**: `cookies()`, `headers()`, `params`, `searchParams` ต้อง `await` เสมอ (เช่น `const { id } = await ctx.params`) — มี `RouteContext<'/path'>` helper type ให้ใช้กับ dynamic route handlers
3. **Cache Components เป็น opt-in feature ใหม่** (ยังไม่ได้เปิดใช้ในโปรเจกต์นี้) — ถ้าไม่เปิด, Route Handlers ทำงานแบบ request-time ตามปกติ (ไม่ cache) ซึ่งเหมาะกับ API ที่ mutate ข้อมูลอย่าง Worksheet อยู่แล้ว ไม่ต้องเปิดฟีเจอร์นี้สำหรับรอบพัฒนานี้
4. **รูปแบบ Session ที่ Next.js แนะนำเองตรงกับ design ที่อนุมัติไว้แล้ว**: DB-backed session (ตาราง sessions) + เก็บ **session ID ที่เข้ารหัสแล้ว** (ไม่ใช่ raw ID) ใน httpOnly cookie ผ่าน `cookies()` API — ใช้ library `jose` (JWT sign/verify) หรือ `iron-session` ตามที่เอกสารแนะนำ, ทำ Data Access Layer (`verifySession()` cached ด้วย React `cache()`) เป็นจุดตรวจสอบสิทธิ์กลาง แทนที่จะเช็คกระจายทุกที่
5. ก่อนเขียนโค้ด Next.js ส่วนใดที่ไม่มั่นใจ ให้ตรวจ `node_modules/next/dist/docs/` ก่อนเสมอ (เอกสารสดของเวอร์ชันที่ติดตั้งจริง)

## Scaffold ที่ทำไปแล้ว (2026-09-16)

- Next.js **16.3.5** (pinned exact, ไม่ใช้ range) + React **19.3.0** + TypeScript **6.0.3** (ไม่ใช้ 7.0.2 — `typescript-eslint` ยังไม่รองรับ TS 7) + Tailwind CSS 4
- โครงสร้าง: `src/app/` (App Router, `layout.tsx`/`page.tsx`/`globals.css`), `src/lib/prisma.ts` (Prisma Client singleton ผ่าน `@prisma/adapter-mssql`, กันสร้าง connection pool ซ้ำตอน dev hot-reload)
- `package.json` เปลี่ยนเป็น `"type": "module"` (จำเป็นสำหรับ Next.js App Router ESM)
- **ESLint**: ไม่ได้ใช้ `eslint-config-next` ผ่าน FlatCompat ตามปกติ เพราะชนบั๊กจริง (`TypeError: Converting circular structure to JSON` — `@eslint/eslintrc`'s legacy validator เจอ self-referencing flat plugin object ของ `eslint-plugin-react`/`@next/eslint-plugin-next` แล้ว crash ตอน format error message) — แก้โดยประกอบ flat config เองตรงจาก native export ของแต่ละ plugin ใน `eslint.config.mjs` แทน (ดูคอมเมนต์ในไฟล์)
- ตรวจแล้ว: `npm run build`, `npx eslint .`, `npm run dev` ผ่านทั้งหมด

## Authentication ที่ทำไปแล้ว (2026-09-16)

- `src/lib/password.ts` — hash/verify ด้วย `bcryptjs` (ไม่ใช้ `bcrypt` native เพื่อเลี่ยงปัญหา build tools บน Windows)
- `src/lib/session.ts` — DB-backed session ตาม `sys_session`: `createSession()` สร้างแถวจริง + เข้ารหัส `{sessionId, userId}` ด้วย `jose` (HS256, อายุ 7 วัน) เก็บใน httpOnly cookie ชื่อ `session`; `verifySessionRecord()` เช็คแบบ secure (hit DB, ดู IsRevoked/ExpiresDate/User.IsActive); `readOptimisticSession()` เช็คแบบ cookie-only (ไม่ hit DB) สำหรับ `proxy.ts` เท่านั้น; `deleteSession()` ตั้ง `IsRevoked=true` (เก็บ audit ไว้ ไม่ลบแถว) + ลบ cookie
- `SESSION_SECRET` ใน `.env` — สร้างเองด้วย `crypto.randomBytes(32)` (ไม่ใช่ข้อมูลธุรกิจที่ต้องถามผู้ใช้ เป็น key เข้ารหัสทางเทคนิคล้วนๆ) — หมุนคีย์นี้จะ invalidate ทุก session ทันที
- `src/lib/dal.ts` — `verifySession()` จุดตรวจสอบสิทธิ์กลางจุดเดียว (cached ด้วย React `cache()` ต่อ request) ทุก Route Handler/Page ที่ต้องการ auth ต้องเรียกจุดนี้ ห้ามอ่าน cookie ตรงๆ
- `proxy.ts` (ไม่ใช่ `middleware.ts`) — optimistic redirect เท่านั้น, หน้า/route จริงยังต้องเช็ค secure ผ่าน DAL เอง (defense in depth ตามที่เอกสาร Next.js แนะนำ)
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` — ใช้ error format `{error, message}` ตาม FSD, log เข้า `sys_process_log` ทุกครั้งที่ login/logout สำเร็จ
- `prisma/seed.ts` — seed บัญชี `admin` เริ่มต้น (รันแล้วครั้งเดียว, รหัสผ่านสุ่มแสดงตอนรันแค่ครั้งเดียวไม่เก็บที่ไหนอีก — **ต้องเปลี่ยนรหัสผ่านนี้ทันทีที่มีหน้าจอจัดการผู้ใช้**); `prisma7.config.ts` เพิ่ม `migrations.seed` ชี้มาที่ไฟล์นี้ (รันด้วย `npx prisma db seed`)
- ยังไม่มี: หน้าจอ/endpoint เปลี่ยนรหัสผ่าน, สิทธิ์ตาม `sys_user_permission`/DocumentType (ยังเช็คแค่ authenticated หรือไม่ ไม่เช็ค authorize รายเมนู — ต้องทำตอนเริ่ม Worksheet module), Worksheet API/UI

### เหตุการณ์ที่ต้องระวัง: `next dev` เคยลบเนื้อหาไฟล์นี้เอง (2026-09-16)

ตอนเขียนหัวข้อ "Next.js 16" ด้านบน มีประโยคที่ quote ข้อความ marker comment ของฟีเจอร์ auto-agent-rules ของ Next.js ไว้ตรงๆ (เพื่ออธิบายว่ามันหน้าตาเป็นยังไง) — พอรัน `next dev` รอบถัดมา ตัวสร้างไฟล์อัตโนมัติของ Next.js ไปเจอ marker ที่ผมเขียนอธิบายไว้ (ไม่ใช่ block จริง) เข้าใจผิดคิดว่าเป็น block เดิม แล้วลบเนื้อหาระหว่างนั้นไปเกือบ 23 บรรทัด (หัวข้อ "Scaffold ที่ทำไปแล้ว" หายไปทั้งหมด) กู้คืนจาก git commit ล่าสุดได้ทัน — **ปิดฟีเจอร์นี้แล้ว** (`agentRules: false` ใน `next.config.ts`) และเขียนประโยคด้านบนใหม่ไม่ให้ quote marker ตรงๆ อีก

## Version

- เอกสารนี้ตรงกับ HFC_System_Database_Design.docx v1.0 (15/09/2026)
- สถานะ: Database Design อนุมัติแล้ว, Technology Stack ยืนยันเป็น Next.js Full-stack + Prisma 7.10.0 (pinned, ไม่ใช้ 8.0.0-rc) + MSSQL + Session/Cookie Auth ผ่าน `sys_session` (2026-09-15). Prisma schema + migration ประยุกต์เข้า DB จริงสำเร็จแล้ว (`CRPAYROLL_007`). Next.js scaffold เสร็จแล้ว (2026-09-16, build/lint/dev ผ่านหมด). Authentication (session lib/DAL/proxy.ts/login-logout API + seed admin) เสร็จแล้ว (2026-09-16, build/lint/e2e ผ่านหมด). ขั้นถัดไป: Worksheet module (สิทธิ์รายเมนูผ่าน sys_user_permission + API/UI)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
