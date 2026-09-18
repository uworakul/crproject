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
## User Setup / Authorization module ที่ทำไปแล้ว (2026-09-16)

ครอบคลุม BR-001–004 (โมดูล 1 ในทุกไฟล์: BRD/Site Map/DDL)

- **sys_menu seed ที่ระดับเมนูย่อย (33 DocumentType, ยืนยันแล้วโดยผู้ใช้)** — `prisma/seed-menus.ts` map 1:1 กับทุก leaf ใน `CRPAYROLL_Site_Map.html` ยกเว้นโมดูล 8 (legacy infra, ไม่เกี่ยวกับระบบใหม่) **ข้อยกเว้นเดียว**: โมดูล 9 (Worksheet) มี 5 leaves ใน site map แต่ BR-045 ล็อก DocumentType เดียวคือ `WORKSHEET` ไว้แล้ว จึงไม่แยกย่อยตาม — รันซ้ำได้ปลอดภัย (`upsert`)
- `src/lib/authorize.ts` — `hasPermission()`/`requirePermission()`: ADMIN role bypass ทุกอย่าง (BR-003), ผู้ใช้อื่น query `sys_user_permission` ตาม (UserID, DocumentType, SiteCode) — แถวที่ SiteCode=NULL ใช้ได้ทุกหน่วยงาน (ตรงกับ design ที่บันทึกไว้ใน Database summary ด้านบน)
- **Users API** (`src/app/api/users/**`): CRUD ผู้ใช้ (`GET/POST /api/users`, `GET/PUT/DELETE /api/users/[userId]`), เปลี่ยนรหัสผ่าน (`PUT .../password` — self-service ไม่ต้องมีสิทธิ์พิเศษ, เปลี่ยนของคนอื่นต้องมี SAVE บน USER), สิทธิ์รายเมนู (`GET/PUT .../permissions` — PUT แทนที่ทั้งชุดทุกครั้ง ไม่ diff ทีละ checkbox), คัดลอกสิทธิ์ (`POST .../copy-permissions`, ตรง BR-004) — ทุก endpoint เช็คสิทธิ์ผ่าน `requirePermission(user, "USER", action)` ก่อนเสมอ, log เข้า `sys_process_log` ทุกจุดที่ mutate
- **DELETE = soft delete เท่านั้น** (`IsActive=false`) — sys_user ถูกอ้างอิงแทบทุกตารางด้วย FK แบบ NO ACTION (ตรงกับ DDL ที่อนุมัติ) ลบจริงจะพังทันทีที่มีประวัติ; ห้าม deactivate ตัวเอง (กันล็อกตัวเองออกจากระบบ)
- **UI**: `/users` (รายการ), `/users/new` (สร้าง), `/users/[userId]` (แก้ไขข้อมูล + เปลี่ยนรหัสผ่าน + ตารางสิทธิ์ 33 แถว × 4 คอลัมน์ + คัดลอกสิทธิ์) — ทุกหน้าเช็คสิทธิ์ฝั่ง Server Component ก่อน render (redirect ถ้าไม่มีสิทธิ์ READ)
- **ข้อจำกัดที่ตั้งใจไว้ (บันทึกไว้ ไม่ใช่ลืมทำ)**: หน้าตารางสิทธิ์บันทึกได้เฉพาะแบบ "ทุกหน่วยงาน" (SiteCode=NULL) ต่อ DocumentType เท่านั้น — สิทธิ์แยกรายหน่วยงาน (เช่น SITE_HEAD ที่ควรเห็นแค่ site ตัวเอง) API รองรับอยู่แล้ว (`hasPermission`/PUT permissions รับ siteCode ได้) แต่ UI ยังไม่มีช่องให้เลือก site ต่อแถว — ต้องทำเพิ่มถ้าต้องใช้งานจริง
- ทดสอบ end-to-end กับ DB จริงครบ: create user → ไม่มีสิทธิ์ → 403 → grant READ → 200 → ยังไม่มี SAVE → 403 → self password change → deactivate self ถูกกัน → deactivate คนอื่น → login ถูกปฏิเสธด้วย ACCOUNT_DISABLED (ลบข้อมูลทดสอบออกจาก DB แล้ว)
- ยังไม่มี: Worksheet API/UI (โมดูล 9), Site CRUD จริง (โมดูล 6 — ตอนนี้ mst_site ว่างเปล่า มีแค่ GET /api/sites สำหรับ dropdown)

## Worksheet module ที่ทำไปแล้ว (2026-09-16, โมดูล 9 — BR-040–047)

- **sys_menu ครบแล้วจากโมดูลก่อนหน้า**: `mst_attendance_code` seed 4 แถว (D/N/D-N/F, PayMultiplier ตาม FSD: 1.0/1.0/2.0/0.0) เพิ่มเข้า `prisma/seed.ts`
- **⚠️ พบข้อจำกัดจริงของ Prisma 7 ที่กระทบตารางนี้โดยเฉพาะ**: โมเดลที่มีคอลัมน์ `Unsupported("rowversion")` (คือ `trn_worksheet_header`/`trn_worksheet_detail` — สองตารางที่มี RowVer ตามที่อนุมัติ) **ถูกตัด `.create()`/`.upsert()` ออกจาก Prisma Client ที่ generate มาทั้งหมด** (find/update/delete ใช้ได้ปกติ) — workaround คือใช้ raw parameterized SQL (`$queryRaw`/`$executeRaw` พร้อม `OUTPUT INSERTED.col`) เฉพาะจุด INSERT 2 จุดเท่านั้น (`getOrCreateDraftWorksheet` ใน `src/lib/worksheet.ts`, และ `POST /api/worksheets/[id]/employees`) ส่วนที่เหลือทั้งหมดยังใช้ Prisma Client ปกติ — ถ้าพบ error "Property 'create' does not exist" กับตารางอื่นที่มี ROWVERSION/Unsupported field ในอนาคต ให้ใช้วิธีเดียวกันนี้
- **`src/lib/worksheet.ts`**: `getOrCreateDraftWorksheet()` — ตรง UNIQUE(SiteCode,WorkYear,WorkMonth), auto-pull REGULAR จาก `mst_employee.DefaultSiteCode` พร้อม snapshot `DailyRate` (ข้ามพนักงานที่ยังไม่มี DailyRate — Employee Master ยังไม่มี UI); `getWorksheetDetail()` — คำนวณ total ต่อคนด้วย `Prisma.Decimal` (ไม่ใช้ float); `approveWorksheet()` — คำนวณ WorkDays/DoubleShiftDays/HolidayDays จาก PayMultiplier ของแต่ละวัน (1.0→work, 2.0→double, 0→holiday) แล้ว auto-post เข้า `trn_payroll_transaction` **ทั้งหมดใน DB transaction เดียว**ต่อ employee โดย lookup `sys_period` จาก (EmployeeType, WorkYear, WorkMonth) — **ถ้าพนักงานคนไหนไม่มี sys_period ที่ตรงกัน ทั้ง transaction ล้มเหลวและ worksheet คงสถานะ SUBMITTED ไว้ (ไม่ APPROVE บางส่วน)** ตรงตาม FSD ที่ระบุไว้; NetPay = GrossWage เสมอ (หัก tax/SSO/advance-loan เป็นหน้าที่โมดูล Payroll Calculate ที่ยังไม่สร้าง)
- **API ครบตาม FSD §6**: `GET /api/worksheets?site=&year=&month=` (auto-create), `GET /api/worksheets/[id]`, `POST/DELETE .../employees`, `PUT .../days` (bulk, ส่งทั้งกริดทุกครั้งไม่ diff), `POST .../submit`, `POST .../approve`, `POST .../reject` — error code ตาม FSD เป๊ะ (`WORKSHEET_LOCKED` ตอนแก้ non-DRAFT, `INVALID_STATUS_TRANSITION` ตอน submit/approve/reject ผิดสถานะ, `AUTO_POST_FAILED` พร้อม `reason`/`empCode` ตอน approve ไม่ผ่าน)
- **UI**: `/worksheet` — กริดพนักงาน×วัน คลิก cell วนรหัส D→N→D-N→F→ว่าง, legend, summary, ปุ่มตาม status/สิทธิ์ (Draft: บันทึก/ส่งอนุมัติ, Submitted: อนุมัติ/ตีกลับ, Approved: ล็อก) — **ข้อมูลเริ่มต้น fetch ฝั่ง Server Component แล้วส่งเป็น prop** (ไม่ใช้ `useEffect` fetch-on-mount) เพราะ `eslint-plugin-react-hooks` เวอร์ชันนี้ (React Compiler ruleset) ห้าม effect ที่ลงท้ายด้วย setState แม้จะผ่าน async/await — การเปลี่ยน site/เดือน/ปี, save, submit, approve, reject ทุกอย่างเรียก fetch จาก event handler (onChange/onClick) เท่านั้น ไม่ใช่จาก effect
- Site management ยังไม่มี UI แยก แต่เพิ่ม `POST /api/sites` (คู่กับ `GET` เดิม) เพราะ Worksheet ต้องมี mst_site อย่างน้อย 1 แถวถึงจะทำงานได้ — Site CRUD เต็มรูปแบบยังเป็นของโมดูล 6 (Payroll)
- **ทดสอบ end-to-end กับ DB จริงครบทุก branch**: auto-create draft ดึง REGULAR ถูกต้อง → บันทึกวันแล้ว total ตรงสูตร (คำนวณมือเทียบแล้วตรงเป๊ะทุกเคส) → submit → approve สำเร็จ ตรวจ `trn_payroll_transaction` ตรงทุกคอลัมน์ → **ทดสอบ approve ล้มเหลว (ไม่มี sys_period ตรง) แล้วยืนยันว่า header ไม่ขยับจาก SUBMITTED (atomicity ใช้ได้จริง)** → reject กลับเป็น DRAFT พร้อมเหตุผล (ยืนยันว่า Thai text ผ่าน Prisma/mssql ถูกต้อง 100% — ตัวที่เพี้ยนก่อนหน้าเป็นปัญหา encoding ของ bash/curl command-line บน Windows เท่านั้น ไม่ใช่บั๊กแอป) → WORKSHEET_LOCKED บล็อกแก้ไข worksheet ที่ APPROVED แล้ว → INVALID_STATUS_TRANSITION บล็อก approve ซ้ำ → เพิ่ม/ลบพนักงาน SPARE + กันเพิ่มซ้ำ (ลบข้อมูลทดสอบออกจาก DB ครบแล้ว)
- ยังไม่มี: Employee Master module UI (~~โมดูล 3~~ ทำแล้ว ดูหัวข้อถัดไป), Period Setup UI (โมดูล 2, BR-005 — สร้าง sys_period ได้แค่ผ่าน script), Payroll Calculate module (โมดูล 6 — tax/SSO/deduction ยังไม่คำนวณ), `/worksheets/{id}/print` (export PDF/Excel), ตารางสิทธิ์ WORKSHEET แบบแยกรายหน่วยงานใน UI (ข้อจำกัดเดียวกับ User module)

## UI Shell ใหม่ + Reference module ที่ทำไปแล้ว (2026-09-17)

- **App shell**: ย้ายหน้าที่ต้อง login เข้า route group `src/app/(app)/` (URL เดิม ไม่เปลี่ยน) ใช้ `layout.tsx` เดียวเช็ค auth+สร้าง sidebar nav ครั้งเดียว (ก่อนหน้านี้แต่ละหน้าเช็คเอง) — sidebar/header อ้างอิง layout จากภาพตัวอย่างที่ผู้ใช้ส่งมา (ระบบ CROWN ของ hfcwork.com — **เอาแค่โครงสร้าง layout, ไม่เอา branding/สี/โลโก้** ตามที่ผู้ใช้ย้ำ "สะอาดๆ minimal") — ใช้ชื่อแบรนด์ **CRPAYROLL** (ชื่อโปรเจกต์จริงเอง ไม่ใช่ HFC) ตามที่ผู้ใช้ยืนยัน, โทนสีขาว-เทาอ่อน ไม่มีแดง/รูปพื้นหลัง
- **หน้า Login ใหม่**: การ์ดกลางจอ + ปุ่มแสดง/ซ่อนรหัสผ่าน (โครงสร้างอ้างอิงจากภาพเดียวกัน ตัดพื้นหลังรูป/สีแดงออก)
- **Reference module (โมดูล 2 บางส่วน, ครอบคลุม 7 ตาราง)**: `sys_menu` DocumentType `REFERENCE` (ธนาคาร/แผนก/ตำแหน่ง/ฐานประกันสังคม/บัญชีดำ) และ `TAX_RATE` (ขั้นภาษี/ค่าลดหย่อน) — ธนาคาร/แผนก/ตำแหน่ง soft-delete (มี `IsActive`, ถูกอ้างจาก `mst_employee` ด้วย NO ACTION FK), ฐานประกันสังคม/บัญชีดำ/ขั้นภาษี/ค่าลดหย่อน hard-delete (ไม่มี `IsActive` ใน DDL, ไม่มีตารางอื่นอ้างอิง) — UI ที่ `/reference` และ `/reference/tax` ใช้ component เดียวกัน (`reference-table.tsx`, data-driven ด้วย field config) ครอบคลุมทั้ง 7 ตาราง ทดสอบ CRUD ผ่าน DB จริงแล้ว
- Period Setup, Process Log, Change Employee No. (ที่เหลือของโมดูล 2) ยังไม่ทำ — ตั้งใจแยกจาก "Reference" เพราะเป็นคนละลักษณะงาน (workflow/audit ไม่ใช่ตารางอ้างอิงแบบ code+name)

## Employee Master ที่ทำไปแล้ว (2026-09-17, โมดูล 3 — BR-010–014)

- **`src/lib/validation.ts` เพิ่ม `EMPLOYEE_TYPE_VALUES`** (4 ประเภทตาม BR-005: PROVINCIAL_DAILY/PROVINCIAL_MONTHLY/KORAT_DAILY/KORAT_MONTHLY) — **สำคัญ**: `mst_employee.EmployeeType` ไม่มี CHECK constraint ใน DDL แต่ค่านี้ต้องตรงกับ `sys_period.EmployeeType` ไม่งั้น Worksheet approve จะหา period ไม่เจอ (`PERIOD_NOT_FOUND`) — ต้องใช้ค่าจาก list นี้เท่านั้นเวลาสร้าง Period Setup module ในอนาคตด้วย
- **สร้างพนักงานแล้ว auto-create แถว `mst_employee_quota` ทั้ง 5 ประเภททันที** (limit=0 จนกว่า HR จะตั้งวงเงิน) — ตรง BR-011
- **DELETE = soft delete** (`IsActive=false`, สำหรับแก้ข้อมูลผิดพลาด) **แยกจาก "ลาออก"** (`POST /api/employees/[empCode]/resign` → ตั้ง `EmployeeStatus='RESIGNED'` + `ResignDate`, กันลาออกซ้ำด้วย 409 `ALREADY_RESIGNED`) — สองอย่างนี้ตั้งใจแยกกัน ไม่ใช่ปนกัน
- **โควตา**: `PUT /api/employees/[empCode]/quota` แก้ได้แค่ `QuotaLimit`, ส่วน `QuotaUsed` เป็นหน้าที่โมดูล Request & Approve (ยังไม่สร้าง) ตอน approve คำขอ — `QuotaRemaining` คำนวณ Limit-Used ให้อัตโนมัติทุกครั้งที่บันทึก (ตรงกับ Data Dictionary ที่ระบุว่าเป็น derived value)
- **ประวัติ (`mst_employee_history`)**: append-only, ไม่มีแก้ไข/ลบ ตรงกับ BR-013 — **`HistoryID` เป็น `BIGINT`/`bigint` ใน JS ซึ่ง `JSON.stringify`/`NextResponse.json` ทำงานด้วยไม่ได้ตรงๆ** แก้โดยเพิ่ม replacer แปลง BigInt→string ใน `apiSuccess()` (`src/lib/api-response.ts`) แบบ generic เผื่อตารางอื่นที่มี BIGINT PK (เช่น `sys_process_log.LogID`) ในอนาคต — จุดนี้ต้องระวังทุกครั้งที่ expose BIGINT column ผ่าน API
- **เงินเดือนย้อนหลัง (BR-014)**: read-only tab ดึงจาก `trn_payroll_transaction` ตรงๆ (ไม่มีตารางแยก) — ว่างเปล่าจนกว่าจะมี Worksheet approve หรือ Payroll Calculate
- **UI**: `/employees` (รายการ), `/employees/new` (สร้าง), `/employees/[empCode]` (tab: ข้อมูลทั่วไป+ลาออก / โควตา / ประวัติ / เงินเดือนย้อนหลัง — ใช้ `Tabs` component เดียวกับ Reference module)
- ทดสอบ end-to-end กับ DB จริงครบ: สร้างพนักงาน→quota auto-create 5 แถว→ตั้งวงเงิน→เพิ่ม memo (Thai ถูกต้อง)→ลาออก→ลาออกซ้ำ 409→เงินเดือนย้อนหลังว่างเปล่าตามคาด (ลบข้อมูลทดสอบออกจาก DB แล้ว)
- ยังไม่มี: อัปโหลดรูปพนักงาน (BR-012 — `PhotoPath` มีคอลัมน์ใน DDL แต่ยังไม่ตัดสินใจที่เก็บไฟล์ ไม่ทำ UI จนกว่าจะเลือก storage), ค้นหา/กรองในหน้ารายการพนักงาน

## Period Setup ที่ทำไปแล้ว (2026-09-17, โมดูล 2 ส่วนสุดท้าย — BR-005)

- `GET/POST /api/periods`, `PUT/DELETE /api/periods/[id]` (DocumentType `PERIOD`) — DDL ไม่มี UNIQUE constraint บน (EmployeeType, PeriodYear, PeriodMonth) แต่ API กันซ้ำเองระดับ application เพราะ `approveWorksheet()` หาแบบ `findFirst` จากชุดนี้ ถ้าซ้ำจะกำกวมว่าใช้ตัวไหน
- ลบเป็น hard delete (ไม่มี `IsActive` ใน DDL) แต่ปล่อยให้ DB reject เองถ้ามี `trn_payroll_transaction`/`trn_payroll_calculate_log`/`trn_payroll_lock` อ้างอิงอยู่แล้ว (NO ACTION FK) แล้วจับ error คืนเป็น `PERIOD_IN_USE` แทนที่จะเช็คไล่ทีละตารางเอง
- ปุ่ม "ปิดงวด/เปิดงวด" สลับ `Status` ได้ — **หมายเหตุที่พบระหว่างทดสอบ (ยังไม่แก้ เก็บไว้พิจารณา)**: `approveWorksheet()` ไม่เช็ค `Status` ของ period เลย (หา period ที่ตรง EmployeeType/Year/Month เจอก็ใช้ได้แม้ Status='CLOSED') — ถ้าต้องการให้ period ที่ปิดแล้วห้าม auto-post เพิ่ม ต้องแก้ `src/lib/worksheet.ts` ตอนทำ Payroll Lock/Closing module (BR-032/034) ซึ่งน่าจะเป็นจุดที่ถูกต้องกว่าที่จะบังคับกฎนี้
- **ทดสอบ full loop จริงจบครบวงจรแล้ว**: สร้าง period ผ่าน UI/API (ไม่ใช่ script) → Worksheet ของ DEMO01 (2026-09) → บันทึกวัน → submit → **approve สำเร็จโดยใช้ period ที่สร้างผ่านหน้าเว็บจริง** — ปิด gap "Worksheet approve ต้องพึ่ง script สร้าง period" ที่บันทึกไว้ตั้งแต่โมดูล Worksheet เรียบร้อยแล้ว (ข้อมูล demo นี้ตั้งใจเก็บไว้ไม่ลบ เพราะ DEMO01/DEMO001/DEMO002 ถูกเก็บไว้ให้ผู้ใช้ดูอยู่แล้ว)

## Request & Approve ที่ทำไปแล้ว (2026-09-17, โมดูล 4 — BR-015–019)

- `src/lib/request.ts`: 3 `RequestType` (ADVANCE/LOAN/TRAINING) แต่ละอันมี `DocumentType` แยก (`REQUEST_ADVANCE`/`REQUEST_LOAN`/`REQUEST_TRAINING`) — เช็คสิทธิ์ตาม type ของ request นั้นๆ ไม่ใช่สิทธิ์ก้อนเดียวรวม
- **⚠️ พบจุดสำคัญตอนวิเคราะห์**: `trn_request.RequestType` CHECK มี 3 ค่า (ADVANCE/LOAN/TRAINING) แต่ `mst_employee_quota.QuotaType` CHECK มีแค่ 5 ค่า (ADVANCE/LOAN/UNIFORM/SERVICE/INSURANCE) — **ไม่มี TRAINING ในนั้นเลย** สรุปแล้วว่า Training request approve ได้โดยไม่แตะ `mst_employee_quota` เลย (ไม่มีแถวให้อัปเดต) ส่วน Advance/Loan อัปเดต `QuotaUsed`/`QuotaRemaining` ตามที่อนุมัติไว้ใน CLAUDE.md เดิม — `quotaTypeForRequest()` คืน `null` สำหรับ TRAINING เพื่อสื่อความตั้งใจนี้ชัดๆ
- **Approve เช็ค `Amount > QuotaRemaining` ก่อนอนุมัติ** (422 `QUOTA_EXCEEDED`) — ถ้าไม่มีแถว quota เลยคืน 422 `QUOTA_NOT_FOUND` แทนที่จะเดา/สร้างให้เอง (พนักงานที่สร้างผ่าน Employee Master ใหม่จะมี 5 แถวอัตโนมัติอยู่แล้ว ถ้าเจอ error นี้แปลว่าพนักงานคนนั้นถูกสร้างก่อนมี Employee Master module)
- Reject กลับเป็น DRAFT พร้อม `RejectReason` (ตรง BR-018 "Reject แก้ไข+Submit ใหม่ได้") — ใช้ pattern เดียวกับ Worksheet reject เพื่อความสม่ำเสมอ
- **Draft List (BR-019)**: `GET /api/requests/draft-list` — รวม request สถานะ SUBMITTED ทุกประเภทที่ผู้ใช้มีสิทธิ์ READ เท่านั้น (ชื่อ endpoint อิง BR แต่จริงๆ กรองด้วย Status=SUBMITTED ไม่ใช่ DRAFT — เป็นคิวของผู้อนุมัติ)
- **🐛 บั๊กที่เจอ+แก้ระหว่างทดสอบ**: `PUT /api/employees/[empCode]/quota` (จากโมดูล Employee Master) ใช้ `updateMany` ซึ่ง **เงียบไม่ error เมื่อไม่มีแถวให้ update** (พนักงานที่สร้างก่อนมี Employee Master, เช่น DEMO001 ที่สร้างผ่าน SQL script ตรงๆ ไม่มีแถว quota เลย) ทำให้ตั้งวงเงินไม่ติดจริง — เปลี่ยนเป็น `upsert` ต่อแถวแทน แก้ทั้ง legacy data และ data ใหม่ให้ทำงานถูกต้องเหมือนกัน
- ทดสอบ end-to-end กับ DB จริงครบ: สร้าง draft → approve ก่อน submit ถูกกัน (409) → submit → แก้ไขตอน SUBMITTED ถูกกัน (409 `REQUEST_LOCKED`) → approve สำเร็จ ตรวจ quota อัปเดตตรงเป๊ะ (2000/3000 → เหลือ 1000) → คำขอที่ 2 เกินวงเงินที่เหลือ → 422 `QUOTA_EXCEEDED` → reject กลับ DRAFT → Training approve ไม่แตะ quota เลยตามที่ออกแบบ → draft-list ว่างหลัง resolve หมด (เก็บข้อมูล demo นี้ไว้ไม่ลบ แสดงทั้ง 3 สถานะ approve/reject/quota-exceeded ให้ดูพร้อมกัน)

## Inventory module ที่ทำไปแล้ว (2026-09-17, โมดูล 5 — BR-020–027)

8 หน้าจอครบ: ผู้ขาย/คลังสินค้า/สินค้า (`/inventory`, ใช้ `ReferenceTable` component เดิมจากโมดูล Reference ได้ตรงๆ เพราะโครงสร้างข้อมูลเหมือนกัน — code+name+IsActive) และ 5 เอกสารการเคลื่อนไหวสต๊อก (`/inventory/{count,purchase,transfer,issue,return}`)

- **`src/lib/inventory.ts`**: ยึด design ที่อนุมัติไว้แล้ว — `inv_stock_movement` เป็น Ledger กลาง ไม่มีตาราง "ยอดคงเหลือ" แยกต่างหาก ยอดคงคลังคำนวณสดจาก `inv_stock_movement_detail` ที่ `Status=CONFIRMED` เท่านั้น (`getStockBalance`/`getStockBalancesForWarehouse`) ทิศทางตาม `MovementType`: PURCHASE/ADJUST/RETURN บวกเข้า `WarehouseCode`, ISSUE ลบออกจาก `WarehouseCode`, TRANSFER ลบจาก `WarehouseCode` บวกเข้า `TargetWarehouseCode` — `ADJUST` ยอมรับ `Qty` ติดลบได้ (แก้ยอดจากตรวจนับจริง)
- **Workflow ง่ายกว่า Worksheet/Request**: แค่ 2 สถานะ `DRAFT → CONFIRMED` (ไม่มี SUBMIT แยก) — Confirm ต้องมีสิทธิ์ `approve` บน DocumentType นั้นๆ (`STOCK_COUNT`/`STOCK_PURCHASE`/`STOCK_TRANSFER`/`STOCK_ISSUE`/`STOCK_RETURN`) เหมือนเป็นจุดอนุมัติ เพราะ Confirm กระทบยอดสต๊อกจริง/หนี้พนักงานจริง แก้ไขย้อนกลับไม่ได้ (CONFIRMED แล้วแก้/ลบไม่ได้ ต้องออกเอกสารใหม่)
- **Field ที่บังคับ/ห้ามใช้ต่างกันตาม MovementType** (DDL ไม่มี CHECK บังคับส่วนนี้ แอปเช็คเอง ผ่าน `validateMovementFields()`): PURCHASE ต้องมี SupplierCode, TRANSFER ต้องมี TargetWarehouseCode (≠ WarehouseCode), ISSUE/RETURN ต้องมี EmpCode, ADJUST ไม่ใช้ field เสริมใดๆ เลย
- **เช็คยอดคงเหลือพอก่อน Confirm เสมอ** สำหรับ movement ที่ดึงสต๊อกออก (ISSUE, TRANSFER, ADJUST ติดลบ) — ไม่พอคืน 422 `INSUFFICIENT_STOCK` พร้อม available/requested (ป้องกันสต๊อกติดลบ ซึ่ง DDL เองไม่ได้บังคับไว้ แต่เป็น data integrity ที่จำเป็นสำหรับธุรกิจจริง)
- **BR-027 หนี้พนักงานอัตโนมัติ (Issue/Return)**: Confirm ของ ISSUE รับ `paidAmount` (ชำระทันที, default 0) คำนวณ `RemainingAmount = TotalAmount - paidAmount` ถ้า > 0 สร้างแถว `inv_employee_debt` (Status=OPEN) ทันที ผูกกับ `MovementID` นั้น; Confirm ของ RETURN รับ `debtId` (เลือกได้ว่าจะเอาไปหักหนี้รายการไหน — ถ้าไม่ส่งมาคือคืนของเฉยๆ ไม่หักหนี้ใคร) หักลด `RemainingAmount` ด้วยมูลค่าที่คืน (ไม่เกินยอดคงเหลือของหนี้นั้น) เพิ่มเข้า `PaidAmount` เท่ากัน ปิดสถานะเป็น CLOSED อัตโนมัติเมื่อ RemainingAmount=0 — **การจับคู่ Return→Debt ให้ผู้ใช้เลือกเองเสมอ ไม่เดาอัตโนมัติ** (พนักงานคนหนึ่งอาจมีหนี้เปิดอยู่หลายรายการพร้อมกัน)
- **API**: `GET/POST /api/inventory/{suppliers,warehouses,products}` + `[code]` (CRUD มาตรฐาน, soft delete ด้วย IsActive เหมือนโมดูลอื่น), `GET/POST /api/inventory/movements?type=` + `[id]` (GET/PUT/DELETE เฉพาะ DRAFT) + `[id]/confirm` (POST), `GET /api/inventory/stock?warehouse=` (อ่านยอดคงคลังสด), `GET /api/inventory/employee-debts?empCode=&status=` (สำหรับหน้า Return เลือกหนี้ที่จะหัก)
- **UI**: `movement-document.tsx` เป็น client component กลางตัวเดียวรองรับทั้ง 5 ประเภทเอกสาร (ต่างกันแค่ field ที่โชว์ตาม MovementType) — ข้อมูลเริ่มต้น fetch ฝั่ง Server Component ส่งเป็น prop เหมือนโมดูลอื่นทั้งหมด, fetch ต่อจากนั้นทั้งหมดมาจาก event handler (เปลี่ยน tab DRAFT/CONFIRMED, เลือกพนักงานเพื่อโหลดหนี้เปิด, save, confirm, delete)
- **ทดสอบ end-to-end กับ DB จริงครบทุก MovementType**: PURCHASE 100 หน่วย → Confirm → ยอดคงคลังตรง 100 → validation กันสร้าง PURCHASE ไม่มี SupplierCode (400) → ห้าม Confirm ซ้ำ (409 `INVALID_STATUS_TRANSITION`) → ห้ามแก้ไข CONFIRMED แล้ว (409 `MOVEMENT_LOCKED`) → ISSUE เกินยอดคงคลัง Confirm ไม่ผ่าน (422 `INSUFFICIENT_STOCK`) → TRANSFER 30 หน่วย ยอดสองคลังตรงพร้อมกัน (70/30) → ADJUST ติดลบ 5 หน่วยแก้ยอดถูกต้อง (65) → ADJUST ติดลบเกินยอดจริงก็ถูกกันเช่นกัน → ISSUE 10 หน่วยมูลค่า 150 บาทให้พนักงาน DEMO001 จ่ายจริง 50 บาท → สร้างหนี้ 100 บาทอัตโนมัติถูกต้อง → RETURN 4 หน่วยมูลค่า 60 บาท เลือกหักหนี้เดิม → หนี้เหลือ 40 บาทตรงตามสูตร (150 total, paid 50+60=110, remaining 40) → ยอดคงคลังกลับมา 59 หลังคืนของ (ลบข้อมูลทดสอบทั้งหมดออกจาก DB ผ่าน script ตรง หลัง test เสร็จ — movement/detail ที่ CONFIRMED แล้วลบผ่าน API ไม่ได้ตามการออกแบบ ต้องลบผ่าน SQL ตรงสำหรับ cleanup เท่านั้น)
- ยังไม่มี: Payroll module (โมดูล 6 — Site CRUD เต็มรูปแบบ, Calculate/Lock/Closing/Report), Leave module (โมดูล 7)

## Payroll module ที่ทำไปแล้ว (2026-09-17, โมดูล 6)

**⚠️ พบข้อเท็จจริงสำคัญก่อนเริ่ม**: FSD §9.1 ระบุตรงๆ ว่า BR-028–039 (โมดูล 6 เดิม) เป็นการสรุปฟังก์ชันของ **ระบบเดิม (legacy)** ไว้อ้างอิงเท่านั้น ("ไม่มีการปรับเปลี่ยนโครงสร้างหรือฐานข้อมูลใดๆ ในเฟสนี้") ไม่ใช่ spec สำหรับสร้างใหม่ — และไม่มีสูตรคำนวณภาษีหัก ณ ที่จ่ายระบุไว้ที่ไหนเลย ทั้งที่ `trn_payroll_transaction`/`ref_tax_bracket`/`ref_sso_base`/`ref_deduction_rate` มีอยู่ในสคีมาจริงและ Worksheet approve auto-post เข้าตารางนี้อยู่แล้ว **ถามผู้ใช้ 2 คำถามก่อนเขียนโค้ด** (2026-09-17): (1) ยืนยันให้สร้างเต็มโมดูล (Site CRUD, Calculate, Lock, Closing, Report สรุป 1 ชุด — ไม่ทำ "30+ รายงาน" ที่ FSD พูดถึงเฉยๆ โดยไม่มีชื่อ/สเปกให้เลย) (2) วิธีคำนวณภาษี — ผู้ใช้เลือก **"Annualize แบบมาตรฐาน + ลดหย่อนส่วนตัวอัตราเดียว"** (ไม่รวมค่าลดหย่อน SPOUSE/CHILD เพราะ mst_employee ไม่มีฟิลด์สถานภาพสมรส/จำนวนบุตร)

- **อัตราภาษี/ปกส./ลดหย่อนปี 2569 (ค.ศ.2026) ตรวจสอบจากเว็บจริงแล้ว ไม่ได้เดา** (WebSearch 2026-09-17, อ้างอิง QuickBooks/Statrys/TaxAtlas สำหรับตารางภาษี, Acclime/HLB/RLC สำหรับ ปกส.) — seed ไว้ใน `prisma/seed.ts` (`seedPayrollRates()`):
  - **ภาษีเงินได้บุคคลธรรมดา** (`ref_tax_bracket`, EffectiveYear=2026): ขั้นบันได 8 ขั้นมาตรฐานไม่เปลี่ยนแปลงสำหรับปี 2569 — 0%(0-150,000) / 5%(150,001-300,000) / 10%(300,001-500,000) / 15%(500,001-750,000) / 20%(750,001-1,000,000) / 25%(1,000,001-2,000,000) / 30%(2,000,001-5,000,000) / 35%(5,000,001 ขึ้นไป)
  - **ประกันสังคม** (`ref_sso_base`, EffectiveYear=2026): ฐาน 1,650–17,500 บาท/เดือน (เพดานปรับขึ้นจาก 15,000 เป็น 17,500 มีผล ม.ค. 2569 เฟส 1 ของแผนหลายปี), อัตรา 5%/5% (ลูกจ้าง/นายจ้าง)
  - **ค่าลดหย่อนส่วนตัว** (`ref_deduction_rate`, DeductionCode=`PERSONAL`): 60,000 บาท/ปี — **ไม่รวม** ค่าใช้จ่าย 50% เพดาน 100,000 บาท (แยกประเภทจากค่าลดหย่อนส่วนตัว ตามที่อนุมัติไว้เฉพาะ "อัตราเดียว")
- **`src/lib/payroll.ts`**: `calculateTaxWithheld()` = annualize (GrossWage×12) → หักลดหย่อน PERSONAL → คำนวณภาษีขั้นบันไดสะสมจาก `ref_tax_bracket` → หาร 12 กลับเป็นยอดหักต่อเดือน; `calculateSso()` = `clamp(GrossWage, MinBase, MaxBase) × EmployeeRate`; ทั้งสองฟังก์ชันโยน `MissingRateDataError` ถ้าปีนั้นไม่มีอัตราที่ seed ไว้ (422 `MISSING_TAX_BRACKET`/`MISSING_SSO_BASE` ไม่ใช่คำนวณเป็น 0 เงียบๆ)
- **`runPayrollCalculate(periodId, ...)`**: BR-030 "คำนวณซ้ำได้ตลอด" — recompute TaxWithheld/SSOAmount/NetPay ทุกครั้งจาก GrossWage ปัจจุบัน + ฟิลด์ที่กรอกมือ (Advance/Loan/Training/UniformDeduct, OtherIncome/OtherDeduction, allowance/OT) ที่มีอยู่แล้วในแถว ไม่แตะ — เขียน log ลง `trn_payroll_calculate_log` (Status=SUCCESS) ทุกครั้ง; `cancelPayrollCalculate()` (BR-031) รีเซ็ต TaxWithheld/SSOAmount กลับ 0 แล้ว recompute NetPay จากฟิลด์ที่เหลือ (ไม่ล้างฟิลด์กรอกมือทิ้ง) log Status=CANCELLED
- **BR-032 Lock/Unlock**: `trn_payroll_lock` ต่องวด — Lock ต้องมีสิทธิ์ `approve` บน `PAYROLL_LOCK` (เพราะเป็นจุด "ควบคุมความถูกต้องก่อนโอนเงิน" ตามที่ FSD อธิบาย) locked แล้ว Calculate/Cancel Calculate/แก้ Transaction/Worksheet approve เข้างวดนั้นถูกบล็อกหมด (409 `PERIOD_LOCKED`)
- **BR-034 Closing — ตีความแบบระมัดระวัง**: FSD เขียนว่า "ล้างรายการ Transaction ของงวดที่ปิดแล้ว" **จงใจไม่ทำเป็นการ DELETE จริง** เพราะ `trn_payroll_transaction` คือประวัติการเงินจริง ไม่มีตารางสำรอง/archive แยกในสคีมาที่อนุมัติไว้ ลบทิ้งจริงจะขัดกับกฎ data integrity ของโปรเจกต์เอง — ตีความ "ล้าง" เป็น "ปิดไม่ให้แก้ไขอีก" แทน: ตั้ง `sys_period.Status='CLOSED'` + บังคับ Lock ค้างไว้ ต้อง Lock ก่อนถึง Close ได้ (409 `PERIOD_NOT_LOCKED`), ปิดซ้ำ/แก้ไขหลังปิดบล็อกหมด, **ไม่มีทาง Reopen** (ตรงตาม "ไม่สามารถย้อนกลับได้หลังปิดงวด")
- **แก้ช่องโหว่ที่พบระหว่างสร้าง**: (1) `/api/periods/[id]` PUT เดิมยอม toggle `Status` OPEN/CLOSED ได้อิสระ (มาจากตอนสร้าง Period Setup module ก่อน Payroll จะมีอยู่จริง) — ทำให้ใครก็ตามที่มีแค่สิทธิ์ `PERIOD` save ข้าม Lock precondition ของ Closing ได้เลย **ปิดช่องนี้แล้ว**: endpoint นี้ปฏิเสธการตั้ง `status` เสมอ (ให้ไปใช้ `POST /api/payroll/closing` แทน) และปฏิเสธการแก้ไขใดๆ ถ้างวดปิดแล้ว — ตัดปุ่ม "ปิดงวด/เปิดงวด" ออกจากหน้า Period Setup UI ด้วย (2) `approveWorksheet()` upsert เดิม set `NetPay = GrossWage` ตรงๆ ทุกครั้งที่ re-approve worksheet ซึ่งจะ**ล้างผล Calculate และฟิลด์กรอกมือ (Advance/Loan/OtherIncome ฯลฯ) ทิ้งเงียบๆ**ถ้า worksheet ถูกแก้+อนุมัติซ้ำหลัง Calculate ไปแล้ว — แก้เป็น: ดึงแถวเดิมมาก่อน (ถ้ามี) คง Advance/Loan/Training/UniformDeduct/OtherIncome/OtherDeduction ไว้ รีเซ็ตเฉพาะ TaxWithheld/SSOAmount=0 (บังคับให้ recalculate ใหม่ ไม่ใช่โชว์เลขภาษีเก่าที่ผิด) (3) เพิ่มเช็ค `trn_payroll_lock` ใน `approveWorksheet()` เอง — งวดที่ล็อกแล้วจะ auto-post เข้าไม่ได้เลย (ธงไว้ตั้งแต่ตอนสร้าง Worksheet module ว่าต้องแก้ตอนมี Payroll Lock — แก้ครบแล้ว)
- **UI**: `/payroll/sites` (ใช้ `ReferenceTable` component เดิม), `/payroll/period` — หน้าเดียวรวม Transaction view/edit + Calculate/Cancel Calculate + Lock/Unlock + Closing + รายงานสรุป (ไม่แยก 6 หน้าตาม Site Map เดิม เพราะทุกอย่างผูกกับ "1 งวด" อยู่แล้ว และ Site Map เป็นแค่ legacy reference ไม่ใช่ spec บังคับ) — เลือกงวดแล้วเห็นสถานะ Lock/summary ก่อนตัดสินใจ Lock/Close เสมอ
- **ทดสอบ end-to-end กับ DB จริงครบ**: สร้าง site/employee/period → Worksheet 20 วันทำงาน (DailyRate 500) → approve → GrossWage=10,000 ตรง → Calculate: Tax=0 (annual 120,000-60,000=60,000 อยู่ในขั้น 0% ทั้งหมด, ตรงตามสูตรมือ), SSO=500 (10,000×5%) ตรงเป๊ะ → แก้ OtherIncome +200 → NetPay ขยับตรง → Cancel Calculate รีเซ็ต Tax/SSO=0 แต่ OtherIncome ยังอยู่ NetPay คำนวณใหม่ถูกต้อง → คำนวณงวดปีที่ไม่มีอัตราเลย (2027) → 422 `MISSING_TAX_BRACKET` → Lock แล้ว Calculate/แก้ Transaction/แก้วันใน Worksheet ถูกบล็อกหมด (409 ตามที่ควร) → Close สำเร็จ → Close ซ้ำ/Unlock ที่ปิดแล้ว/แก้วันที่งวดที่ปิดแล้ว ถูกบล็อกหมด → Close งวดที่ยังไม่ Lock ถูกบล็อก (`PERIOD_NOT_LOCKED`) → รายงานสรุปตรงกับตัวเลขจริงทุกคอลัมน์ (ลบข้อมูลทดสอบออกจาก DB ครบแล้ว)
- ยังไม่มี: Leave module (โมดูล 7 — สุดท้าย)

## Leave module ที่ทำไปแล้ว (2026-09-17, โมดูล 7 — สุดท้าย ครบทั้ง 9 โมดูล)

ตรงไปตรงมากว่า Payroll มาก — `trn_leave_request.Status` CHECK เดียวกับ `trn_request` (DRAFT/SUBMITTED/APPROVED/REJECTED) และ logic คล้าย Request & Approve เกือบทั้งหมด ไม่มีจุดที่ต้องเดาข้อมูลธุรกิจ

- **`mst_leave_type` ไม่มีคอลัมน์ `IsActive`** (ต่างจากตารางอ้างอิงอื่นๆ ทุกตัว) — ใช้ hard delete พร้อมจับ FK violation คืน 409 `LEAVE_TYPE_IN_USE` แทนที่จะฝืนเพิ่ม soft-delete pattern ที่ DDL ไม่ได้ออกแบบมาให้; จัดการผ่าน `/leave/types` ใต้สิทธิ์ `REFERENCE` (ไม่มี DocumentType แยกสำหรับ Leave Type — เหมือน ref_* อื่นๆ)
- **`trn_leave_request` ไม่มีคอลัมน์ RejectReason/RejectedBy/RejectedDate** (ต่างจาก `trn_request` ที่มีครบ ทั้งที่ Status CHECK เหมือนกันเป๊ะ) — ตีความว่า Reject เป็นสถานะปลายทางจริง (REJECTED) ไม่ใช่ cycle กลับ DRAFT แบบโมดูล Request (ที่มีคอลัมน์รองรับเหตุผลชัดเจน) เพราะไม่มีที่เก็บเหตุผล — REJECTED แก้ไข/ส่งใหม่ไม่ได้ ต้องยื่นใบลาใหม่ (audit trail ยังอยู่ครบใน `sys_process_log` ผ่าน `logAction` เหมือนทุกจุด)
- **BR ใบรับรองแพทย์**: เช็คที่ `Submit` ไม่ใช่ตอนสร้าง (422 `MEDICAL_CERT_REQUIRED` ถ้า `LeaveType.RequireMedicalCert=true` และยังไม่ติ๊ก `HasMedicalCert`) — ให้ผู้ขอแนบ/ติ๊กยืนยันก่อนส่งอนุมัติได้ ไม่ใช่บังคับตั้งแต่ตอนกรอกฟอร์ม
- **`mst_employee_leave_balance`** เป็น per (EmpCode, LeaveTypeCode, Year) เหมือน `mst_employee_quota` แต่ต้องสร้างใหม่ทุกปี — ไม่มี BR ระบุวิธี initialize อัตโนมัติ จึงทำเป็นหน้าจอแยก (`/leave/balances`) ให้ตั้ง `Entitled` เองต่อคน/ปี/ประเภท (`Remaining` derived เหมือน quota) — Approve เช็ค `TotalDays > Remaining` ก่อนเสมอ ไม่มีแถว balance เลยคืน 422 `LEAVE_BALANCE_NOT_FOUND` (ไม่เดา/สร้างให้เอง ตาม pattern เดียวกับ Request quota check)
- **`TotalDays` เป็นตัวเลขที่ผู้ใช้กรอกเอง** ไม่ใช่คำนวณอัตโนมัติจาก StartDate/EndDate (DECIMAL(4,1) รองรับลาครึ่งวัน ซึ่งไม่มีสูตรนับวันทำงาน/วันหยุดที่ระบุไว้ที่ไหนเลย) — เช็คแค่ขอบเขตสมเหตุสมผล (`totalDays <= จำนวนวันปฏิทินระหว่าง Start-End`) ไม่ตัดวันหยุดสุดสัปดาห์ให้อัตโนมัติ
- **⚠️ พบ label ผิดที่มีอยู่ก่อนแล้วในหน้า Period Setup**: ช่อง "ปี พ.ศ." ใน `/periods` เขียน label ผิด — ค่าที่เก็บจริงและใช้เทียบใน DB (`sys_period.PeriodYear`, `mst_employee_leave_balance.Year`) เป็น **ค.ศ. (Gregorian)** ล้วนๆ (ยืนยันจากการทดสอบ Payroll module ที่ใช้ periodYear=2026 ตรงๆ) ถ้าใครกรอกเป็น พ.ศ. จริง (เช่น 2569) ข้อมูลจะปีไม่ตรงกับที่ Worksheet/Payroll ใช้จริงทันที —**ไม่ได้แก้ในรอบนี้** (นอก scope, ไม่กระทบ Leave module) แต่ตั้งใจไม่ใช้ label "พ.ศ." ซ้ำในหน้า Leave Balance/Report ใหม่ (ใช้ "ปี (ค.ศ.)" ตรงไปตรงมาแทน) — ควรแก้ label ที่ `/periods` ให้ตรงในรอบถัดไป
- **API**: `/api/leave/types` + `[code]` (REFERENCE), `/api/leave/balances` (GET/POST, LEAVE_REQUEST), `/api/leave/requests` + `[id]` (GET/PUT/DELETE เฉพาะ DRAFT) + `[id]/submit` + `[id]/approve` + `[id]/reject`, `/api/leave/report` (LEAVE_REPORT — ประวัติ + สรุปสิทธิ์คงเหลือรวมกัน)
- **UI**: `/leave/types`, `/leave/balances`, `/leave` (list+create+filter ตาม status), `/leave/[id]` (detail+submit/approve/reject), `/leave/report`
- **ทดสอบ end-to-end กับ DB จริงครบ**: ตั้งสิทธิ์ 10 วัน → ยื่น 2 วัน → submit → approve → balance ตรง (used=2, remaining=8) → ยื่นเกินสิทธิ์ (20 วัน) → approve ถูกกัน 422 `LEAVE_BALANCE_EXCEEDED` → reject → แก้ไข REJECTED ถูกกัน 409 → ประเภทที่ต้องใบรับรองแพทย์ submit ไม่ติ๊กถูกกัน 422 `MEDICAL_CERT_REQUIRED` → ติ๊กแล้ว submit ผ่าน → approve แบบไม่มี balance เลยถูกกัน 422 `LEAVE_BALANCE_NOT_FOUND` → ลบประเภทการลาที่ถูกใช้งานแล้วถูกกัน 409 `LEAVE_TYPE_IN_USE` → รายงานแสดงประวัติ+สรุปสิทธิ์ถูกต้อง (ลบข้อมูลทดสอบออกจาก DB ครบแล้ว)

### เหตุการณ์ที่ต้องระวัง: Turbopack dev server เคยแคช route manifest ค้าง หลังสลับจาก `next build` มา `next dev` (2026-09-17)

หลังรัน `npx next build` แล้วตามด้วย `npx next dev` ทันที (ไม่ได้ล้าง `.next` ก่อน) route ใหม่ที่เพิ่งสร้างในรอบเดียวกัน (`/api/leave/requests/[id]/submit|approve|reject`) คืน 404 จริงจาก Next.js เอง (ไม่ใช่ `apiError` จากโค้ด — response เป็นหน้า HTML 404 ของ Next.js ไม่ใช่ JSON) ทั้งที่ไฟล์ถูกต้องครบและโครงสร้างเหมือน route อื่นที่ใช้งานได้ปกติ (`/api/requests/[id]/submit`, `/api/inventory/movements/[id]/confirm`) — เกิดเฉพาะ route ที่ถูกสร้างขึ้นหลังสุดใน static segment ใหม่ที่ลึก 3 ชั้น (`leave/requests/[id]/submit`) แก้ได้ทันทีด้วย `rm -rf .next` แล้ว restart `next dev` ใหม่ — **บทเรียน**: ถ้าสลับระหว่าง `next build`/`next dev` ในเซสชันเดียวกันแล้วเจอ route คืน 404 ผิดปกติทั้งที่ไฟล์ถูกต้อง ให้ลองล้าง `.next` ก่อนสงสัยว่าโค้ดผิดเสมอ

### เหตุการณ์ที่ต้องระวัง: `next dev` เคยลบเนื้อหาไฟล์นี้เอง (2026-09-16)

ตอนเขียนหัวข้อ "Next.js 16" ด้านบน มีประโยคที่ quote ข้อความ marker comment ของฟีเจอร์ auto-agent-rules ของ Next.js ไว้ตรงๆ (เพื่ออธิบายว่ามันหน้าตาเป็นยังไง) — พอรัน `next dev` รอบถัดมา ตัวสร้างไฟล์อัตโนมัติของ Next.js ไปเจอ marker ที่ผมเขียนอธิบายไว้ (ไม่ใช่ block จริง) เข้าใจผิดคิดว่าเป็น block เดิม แล้วลบเนื้อหาระหว่างนั้นไปเกือบ 23 บรรทัด (หัวข้อ "Scaffold ที่ทำไปแล้ว" หายไปทั้งหมด) กู้คืนจาก git commit ล่าสุดได้ทัน — **ปิดฟีเจอร์นี้แล้ว** (`agentRules: false` ใน `next.config.ts`) และเขียนประโยคด้านบนใหม่ไม่ให้ quote marker ตรงๆ อีก

## Reference module — ปรับปรุงหลังปิดครบ 9 โมดูล (2026-09-17)

ผู้ใช้ขอปรับหน้า `/reference` เพิ่มเติมหลังระบบครบทุกโมดูลแล้ว:

- **ลดคอลัมน์ที่แสดง**: ธนาคาร/ตำแหน่ง/Blacklist เหลือแค่ "รหัส" + "ชื่อ" — ธนาคารตัดชื่อภาษาอังกฤษออก (คอลัมน์ `BankNameEN` ยังอยู่ใน DB เหมือนเดิม เพราะ NOT NULL ไม่มีค่า default แต่ POST API เปลี่ยนมา default เป็นค่าเดียวกับชื่อไทยแทนการบังคับกรอก — ถ้าต้องการชื่ออังกฤษที่ถูกต้องจริงต้องแก้ตรงๆ ทีหลัง), ตำแหน่งตัดเงินตำแหน่งออก (API เดิม default 0 อยู่แล้วไม่ต้องแก้), Blacklist เปลี่ยนจาก 4 คอลัมน์ (ID/เลขบัตร/ชื่อ/เหตุผล) เหลือ "รหัส" (map ไปที่ `IDCardNo` ไม่ใช่ auto-increment ID เพราะเป็น reference code แบบเดียวกับธนาคาร ไม่ผูกกับ `mst_employee`) + "ชื่อ" — เพิ่ม `hidden` flag ใน `FieldDef` (reference-table.tsx) ให้ field เก็บไว้ใช้เป็น URL id (`BlackListID`) ได้โดยไม่ต้องแสดงเป็นคอลัมน์
- **เพิ่มการแก้ไข (PUT) ให้ Blacklist และฐานประกันสังคม** ที่เดิมมีแค่ GET/POST/DELETE (แก้ไม่ได้เลย) ให้ behavior ตรงกับตารางอ้างอิงอื่นๆ
- **`ref_sso_base` เพิ่มคอลัมน์ `EffectiveDate` (DATE, nullable)** — migration ใหม่ `20260917_add_sso_effective_date_and_company` เป็นแค่ข้อมูลอ้างอิงเสริม (วันที่ตรงที่อัตราเริ่มมีผล เช่น 1 ม.ค. 2569 ตอนเพดาน ปกส. เปลี่ยน) **ไม่กระทบ logic คำนวณ** — `calculateSso()` ใน `src/lib/payroll.ts` ยังคง lookup ด้วย `EffectiveYear` เหมือนเดิมทุกประการ
- **เพิ่มตารางใหม่ `ref_company`** (CompanyCode/CompanyName/Address/TaxID/SSORegistNo/ContactPhone) — ตรงกับที่ BR-009 เคยพูดถึง "กำหนดข้อมูลบริษัท" ไว้แต่ไม่เคยมีตารางจริงในสคีมา 33 ตารางที่อนุมัติไว้เดิม เพิ่มแท็บ "Company" ไว้อันดับแรกสุดของหน้า `/reference`, ย้าย "ฐานประกันสังคม" ไปอันดับสุดท้าย — **ตารางนี้ตั้งใจปล่อยว่างไว้ ไม่ seed ข้อมูลบริษัทจริงให้** เพราะไม่มีเลขประจำตัวผู้เสียภาษี/เลขทะเบียนประกันสังคม/ที่อยู่/เบอร์โทรจริงของ ABC CO., LTD. อยู่ในมือ (ตรงกฎ "ห้ามเดาหรือสมมติข้อมูลสำคัญ") — ผู้ใช้ต้องกรอกเองผ่านหน้าเว็บ
- ทดสอบ Company CRUD + SSO EffectiveDate ผ่าน DB จริงแล้ว (สร้าง/แก้ไขสำเร็จ, ลบข้อมูลทดสอบออกหมดหลังทดสอบ ไม่เหลือ placeholder ค้างใน DB จริง)

## Audit columns ทั้งระบบ — CreatedDate/CreatedBy/UpdatedDate/UpdatedBy (2026-09-17)

ผู้ใช้ขอเพิ่มคอลัมน์ตรวจสอบย้อนหลังมาตรฐานให้ **ทุกตารางในระบบ (34 ตาราง)** — ไม่ใช่แค่ตารางที่เพิ่งแก้ล่าสุด ถามขอบเขตก่อนเริ่มเพราะเป็นงานใหญ่ระดับ schema-wide (ทางเลือก "เฉพาะตารางอ้างอิง" vs "ทั้ง 34 ตาราง") ผู้ใช้ยืนยันเอาทั้งระบบ

- **Schema**: เพิ่ม `CreatedDate`/`CreatedBy`/`UpdatedDate`/`UpdatedBy` (ทุกตัว nullable) ในทุกโมเดลที่ยังไม่มีชื่อฟิลด์นี้ตรงๆ — ข้ามตารางที่มีชื่อนี้อยู่แล้ว (เช่น `trn_request.CreatedBy/CreatedDate` เดิม เพิ่มแค่ `UpdatedBy/UpdatedDate` ที่ขาด) — ตารางที่มี field ความหมายเดียวกันแต่ชื่อต่างกัน (`ref_black_list.AddedDate`, `mst_employee_history.RecordedBy/RecordedDate`, `trn_payroll_calculate_log.CalculatedBy/CalculatedDate`, `trn_payroll_lock.LockedBy/LockedDate`) **ยังคงฟิลด์เดิมไว้ทั้งหมด แล้วเพิ่มคอลัมน์มาตรฐานเข้าไปเพิ่ม** (ยอมรับว่ามีความซ้ำซ้อนเล็กน้อยบางตาราง แลกกับ query ยอดเดียวกันได้ทุกตารางแบบเดียวกันเสมอ)
- **`CreatedBy`/`UpdatedBy` เป็น `VARCHAR(20)` ธรรมดา ไม่มี FK ไปหา `sys_user`** — ยึด pattern เดิมที่มีอยู่แล้วในโปรเจกต์ (`trn_worksheet_header.SubmittedBy/ApprovedBy/RejectedBy`, `trn_worksheet_daily.UpdatedBy` — คอมเมนต์เดิมบอกชัดว่า "ไม่มี FK ใน DDL ที่อนุมัติ (ตั้งใจ)") ถ้าเพิ่ม FK จริงจะต้องเพิ่ม named relation ~34 เส้นเข้า `SysUser` model ซึ่งใหญ่เกินความจำเป็นเพื่อ audit trail ธรรมดา
- **Migration**: `20260917_add_audit_columns` — ใช้วิธีเดิม (`prisma migrate diff --from-config-datasource` แล้ว apply ด้วย `migrate deploy`) เพราะ DB user ไม่มีสิทธิ์ `CREATE DATABASE` สำหรับ shadow DB ที่ `migrate dev` ต้องการ — ตัด `ALTER COLUMN RowVer rowversion NOT NULL` ที่ diff เสนอมาออกอีกครั้ง (เป็น introspection artifact เดิม ไม่เกี่ยวกับการเปลี่ยนแปลงจริง เหมือนที่เจอตอนเพิ่ม `ref_company`)
- **แก้ API ทุกจุดที่ create/update ข้อมูล (63 ไฟล์ route.ts ทั่วทั้งระบบ)** ให้ใส่ `CreatedBy: user.userId` ตอนสร้าง และ `UpdatedBy: user.userId, UpdatedDate: new Date()` ตอนแก้ไข/soft-delete/state-transition (submit/approve/reject/confirm/lock/close ทุกจุดนับเป็น "แก้ไข" ด้วย) ครอบคลุมทุกโมดูล — **ข้อยกเว้นเดียวที่ตั้งใจ**: `POST /api/auth/login` อัปเดต `sys_user.LastLoginDate` แต่ไม่แตะ `UpdatedBy/UpdatedDate` เพราะจะทำให้ "แก้ไขล่าสุดเมื่อไหร่" ของบัญชีผู้ใช้กลายเป็นแค่เวลา login ล่าสุดแทนที่จะสื่อถึงการแก้ไขข้อมูลโปรไฟล์/สิทธิ์จริงๆ — `LastLoginDate` เป็น field เฉพาะสำหรับสิ่งนี้อยู่แล้ว
- ทดสอบผ่าน DB จริงครบทุกโมดูลตัวแทน (ref_department, mst_site, inv_supplier, ref_company, mst_employee) ยืนยัน `CreatedBy`/`UpdatedBy` บันทึกถูกต้อง (ลบข้อมูลทดสอบออกหมดแล้ว)

## บั๊กจริง: Tabs ทำให้ ReferenceTable ค้าง state ข้ามแท็บ (2026-09-18)

ผู้ใช้รายงานว่าสลับแท็บ (เช่น บริษัท → ธนาคาร) แล้วตารางแสดง "-" ทุกแถวหรือแสดงจำนวนแถวผิด ทั้งที่ DB/API/SSR payload ถูกต้องทุกอย่าง (ตรวจสอบละเอียดหลายชั้น: query DB ตรง, เรียก API ตรง, อ่าน RSC payload ที่ embed ใน HTML ตรง — ถูกต้องทุกจุด) สุดท้ายเจอสาเหตุจริงด้วย `console.log` วาง props ที่ต้นฟังก์ชัน:

- **Root cause**: `Tabs` (`src/app/(app)/reference/tabs.tsx`) render `{tabs[active].content}` โดยไม่มี `key` — เมื่อทุกแท็บใช้ component type เดียวกัน (`<ReferenceTable>` ซ้ำกันในหลายแท็บ, หรือ `<RequestTypeView>` ในหน้า `/requests`) React ที่ reconciliation ตำแหน่ง JSX เดิม **เห็นว่าเป็น component type เดิม เลยใช้ fiber/instance เดิมแทนที่จะ unmount+remount** — `useState(initialRows)` จึงไม่ re-initialize ตาม prop ใหม่ ทำให้ state (`rows`) ค้างเป็นของแท็บก่อนหน้า แล้วไป lookup field ที่ไม่มีในแถวเดิม (เช่น `row.BankCode` บนแถวที่จริงเป็น Company) ได้ `undefined` → แสดง "-"
- **แก้แล้ว**: เพิ่ม `key` ที่ไม่ซ้ำกัน (ใช้ `apiBase`/`type` เป็น key) ให้ทุก `<ReferenceTable>`/`<RequestTypeView>` ที่ใช้เป็น `content` ของ `Tabs` — บังคับให้ React unmount+remount ทุกครั้งที่สลับแท็บ ครอบคลุม 4 ไฟล์: `reference/page.tsx` (6 แท็บ), `reference/tax/page.tsx` (2 แท็บ), `inventory/page.tsx` (3 แท็บ), `requests/page.tsx`
- **บทเรียน**: ถ้าเจอ "ข้อมูลแสดงผิดทั้งที่ backend ถูกต้อง 100%" ให้สงสัย React reconciliation/component identity ก่อนสงสัย cache — โดยเฉพาะเวลามี component เดียวกันถูกใช้ซ้ำในหลายๆ branch ของ conditional render โดยไม่มี key ชัดเจน (list ปกติจะมี lint warning เตือน แต่ conditional render แบบนี้ (`{cond ? <Foo/> : <Foo/>}` หรือ `{arr[i].content}`) ไม่มี warning เตือนเลย)

## Reference table เพิ่ม search + sort (2026-09-18)

ผู้ใช้ขอเพิ่มการค้นหาและเรียงลำดับใน `reference-table.tsx` (component กลางที่ใช้ทั้ง Reference/Payroll Sites/Inventory):

- **ค้นหา**: ช่อง input กรองบนฝั่ง client จาก `rows` ที่มีอยู่แล้ว (ไม่ยิง API ใหม่) เทียบเฉพาะคอลัมน์ code (`keyField`) กับคอลัมน์ name (`nameField` = visible field แรกที่ไม่ใช่ key) แบบ case-insensitive substring match
- **เรียงลำดับ**: คลิก header คอลัมน์ไหนก็ได้เพื่อ sort ตามคอลัมน์นั้น (คลิกซ้ำสลับ asc/desc, มีลูกศร ▲/▼ บอกสถานะ) เทียบค่าตาม `field.type` ให้ถูกต้อง (number/percent เทียบเป็นตัวเลข, date เทียบเป็น timestamp, text ใช้ `localeCompare` แบบไทย) — **ค่า default เริ่มต้น sort ด้วยคอลัมน์แรกเสมอ** (ไม่ใช่ unsorted) ตามที่ผู้ใช้ระบุ
- **แก้ปุ่ม "ลบ" ของ Bank/Department/Position ให้ลบจริง (hard delete)**: พบว่า commit ก่อนหน้า (`083b195`, "Drop the ระงับ/เปิดใช้งาน toggle") เปลี่ยนแค่ฝั่ง UI (label เป็น "ลบ" แทน "ระงับ") แต่ DELETE endpoint (`banks/departments/positions/[code]/route.ts`) ยังเป็นโค้ดเก่าที่ set `IsActive=false` เท่านั้น — เพราะ `GET` ไม่ได้ filter `IsActive` เลย แถวเลยไม่หายไปจากตารางแม้ "ลบ" สำเร็จ (200) ผู้ใช้สังเกตเจอเอง ("มี isactive = 0 แต่อยากให้ลบออกไปเลย") — แก้เป็น `prisma.*.delete()` จริง พร้อม `try/catch` ดัก FK violation จาก `mst_employee.BankCode/DeptCode/PositionCode` (NO ACTION FK) คืน 409 `BANK_IN_USE`/`DEPARTMENT_IN_USE`/`POSITION_IN_USE` แทนที่จะเดา (pattern เดียวกับ `PERIOD_IN_USE`/`LEAVE_TYPE_IN_USE` ที่มีอยู่แล้ว) — ทดสอบลบผ่าน API ตรงยืนยันแล้วว่าหายจริง

## Version

- เอกสารนี้ตรงกับ HFC_System_Database_Design.docx v1.0 (15/09/2026)
- สถานะ: Database Design อนุมัติแล้ว, Technology Stack ยืนยันเป็น Next.js Full-stack + Prisma 7.10.0 (pinned, ไม่ใช้ 8.0.0-rc) + MSSQL + Session/Cookie Auth ผ่าน `sys_session` (2026-09-15). Prisma schema + migration ประยุกต์เข้า DB จริงสำเร็จแล้ว (`CRPAYROLL_007`). Next.js scaffold + Authentication เสร็จแล้ว (2026-09-16). User Setup/Authorization (โมดูล 1) และ Worksheet (โมดูล 9) เสร็จแล้ว (2026-09-16). UI shell ใหม่, Reference module, Employee Master (โมดูล 3) เสร็จแล้ว (2026-09-17). Period Setup เสร็จแล้ว — ปิดโมดูล 2 ครบ (2026-09-17). Request & Approve (โมดูล 4) เสร็จแล้ว (2026-09-17). Inventory (โมดูล 5) เสร็จแล้ว (2026-09-17, 8 หน้าจอครบ + ledger กลาง + หนี้พนักงานอัตโนมัติ, ทดสอบ e2e ครบทุก MovementType กับ DB จริง). Payroll (โมดูล 6) เสร็จแล้ว (2026-09-17, Site CRUD + Calculate/Cancel Calculate ด้วยอัตราภาษี/ปกส. 2569 จริง (ตรวจสอบจากเว็บ ไม่เดา) + Lock/Unlock + Closing (ตีความ "ล้าง Transaction" แบบไม่ลบข้อมูลจริง) + รายงานสรุป, แก้ช่องโหว่ Period Setup bypass Lock precondition และบั๊ก Worksheet re-approve ล้างผล Calculate ทิ้งเงียบๆ ที่พบระหว่างสร้าง, ทดสอบ e2e ครบกับ DB จริง). **Leave (โมดูล 7) เสร็จแล้ว** (2026-09-17, ทดสอบ e2e ครบรวม balance enforcement + medical cert gate กับ DB จริง). **ครบทั้ง 9 โมดูลตาม scope ที่ตกลงกันแล้ว** — ยังไม่ได้ทำ: หน้า `/worksheets/{id}/print` (export PDF/Excel), สิทธิ์แยกรายหน่วยงานใน UI (Worksheet/Payroll), แก้ label "ปี พ.ศ." ที่ผิดใน `/periods` (ค่าจริงเป็น ค.ศ.), employee photo upload (BR-012), application-level cache สำหรับ ref_*/mst_* — ทั้งหมดเป็นรายการเสริมที่ยังไม่ได้รับการอนุมัติ/ร้องขอ ไม่ใช่งานค้างของ 9 โมดูลหลัก

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
