# CRPAYROLL

ระบบ HR & Payroll สำหรับ **ABC CO., LTD.** (ธุรกิจรักษาความปลอดภัย/จัดหา รปภ. ให้ลูกค้าหลายหน่วยงาน) พัฒนาเป็น Web Application ใหม่ทั้งระบบเพื่อทดแทนโปรแกรม CRPAYROLL เดิม (Desktop/Legacy) ที่เลิกใช้งานแล้ว — ระบบใหม่เป็นเจ้าของข้อมูลทั้งหมดโดยตรง ไม่มีการเชื่อมต่อหรือ migrate จากระบบเดิม

## เทคโนโลยีที่ใช้

- **Framework**: [Next.js](https://nextjs.org/) 16 (App Router) แบบ Full-stack — ไม่มี backend แยก ใช้ Route Handlers (`app/api/**/route.ts`) เป็น API layer โดยตรง
- **ภาษา**: TypeScript ตลอดทั้งโปรเจกต์
- **ORM**: [Prisma](https://www.prisma.io/) 7 (provider `sqlserver`) ผ่าน `@prisma/adapter-mssql`
- **ฐานข้อมูล**: Microsoft SQL Server
- **Authentication**: Session-based (DB-backed session ตาราง `sys_session`) — session ID เข้ารหัสด้วย [`jose`](https://github.com/panva/jose) เก็บใน httpOnly cookie
- **UI**: React 19 + Tailwind CSS 4, [SweetAlert2](https://sweetalert2.github.io/) สำหรับ dialog ยืนยัน
- **อื่นๆ**: `bcryptjs` (hash รหัสผ่าน), `exceljs` (export/import Excel), `google-auth-library` (อัปโหลดรูปพนักงานขึ้น Google Drive)

## โมดูลของระบบ

1. **ผู้ใช้งานและสิทธิ์** — จัดการผู้ใช้, สิทธิ์รายเมนู (แยกตาม DocumentType + หน่วยงานได้)
2. **ตั้งค่าระบบ/รหัสอ้างอิง** — ธนาคาร, แผนก, ตำแหน่ง, งวดการจ่าย, ภาษี/ประกันสังคม/กองทุนสงเคราะห์, เลขที่เอกสาร, Audit Log
3. **ข้อมูลหลักพนักงาน** — ทะเบียนประวัติพนักงานครบวงจร (ข้อมูลส่วนตัว, ประวัติทำงาน/ฝึกอบรม, ลดหย่อนภาษี, รายได้, รายการหักต่องวด)
4. **การขออนุมัติ** — เบิกล่วงหน้า/เงินกู้/ค่าอบรม (header + detail หลายพนักงานต่อเอกสาร)
5. **สินค้าคงคลัง/เครื่องแบบ** — ตรวจนับสต๊อก, ซื้อ, โอน, จำหน่าย, คืนสินค้า (workflow ส่งอนุมัติ), หนี้เครื่องแบบพนักงานอัตโนมัติ
6. **คำนวณและจ่ายเงินเดือน** — รายการประจำงวด, คำนวณภาษี/ประกันสังคม/กองทุนสงเคราะห์, ล็อก/ปิดงวด
7. **การลา** — ประเภทและสิทธิการลา (รวมขั้นตามอายุงาน), ยื่น/อนุมัติใบลา
8. **ใบลงเวลาปฏิบัติงาน (Worksheet)** — กริดลงเวลารายวัน, auto-post เข้าเงินเดือนเมื่ออนุมัติ (จุดเริ่มต้นของโปรเจกต์นี้)
9. **System Configuration** — ค่าตั้งต้นระดับระบบ (เช่น โฟลเดอร์ Google Drive สำหรับเก็บรูปพนักงาน)

## โครงสร้างโปรเจกต์

```
prisma/
  schema.prisma          # Prisma schema (โมเดลทั้งหมด)
  migrations/             # migration history
  seed.ts, seed-menus.ts  # seed ข้อมูลตั้งต้น (บัญชี admin, เมนู/สิทธิ์, อัตรากำลังพล ฯลฯ)
src/
  app/
    (app)/                # หน้าเว็บที่ต้อง login (route group, ใช้ layout เดียวกัน)
    api/                  # Route Handlers (API layer)
    login/                # หน้า login
  lib/                    # Business logic กลาง (worksheet.ts, payroll.ts, inventory.ts, ...),
                           # Prisma client singleton, session/auth helpers
proxy.ts                  # Next.js middleware (ชื่อไฟล์ตาม convention ของ Next.js 16)
```

## เริ่มต้นใช้งาน

### สิ่งที่ต้องมีก่อน

- Node.js (ดู `devDependencies`/`@types/node` สำหรับเวอร์ชันที่รองรับ)
- เข้าถึง Microsoft SQL Server instance ได้ (connection string)

### ติดตั้ง

```bash
npm install
```

`postinstall` จะรัน `prisma generate` ให้อัตโนมัติ

### ตั้งค่า Environment

คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่าจริง:

```bash
cp .env.example .env
```

ตัวแปรที่ต้องตั้ง:

| ตัวแปร | คำอธิบาย |
|---|---|
| `DATABASE_URL` | connection string ของ SQL Server |
| `SESSION_SECRET` | key สำหรับเข้ารหัส session cookie — สร้างด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | (ไม่บังคับ) Service Account JSON key สำหรับอัปโหลดรูปพนักงานขึ้น Google Drive — ดูขั้นตอนสร้างในคอมเมนต์ของ `.env.example` |

**⚠️ ห้าม commit ไฟล์ `.env` จริงเข้า git เด็ดขาด — repository นี้เป็น public**

### ตั้งค่าฐานข้อมูล

```bash
npx prisma migrate deploy   # รัน migration ทั้งหมด
npx prisma db seed          # seed ข้อมูลตั้งต้น (บัญชี admin, เมนู/สิทธิ์ ฯลฯ)
```

รหัสผ่านบัญชี `admin` เริ่มต้นจะถูกสุ่มและแสดงบน console **ครั้งเดียว** ตอนรัน seed — ให้เปลี่ยนรหัสผ่านทันทีหลัง login ครั้งแรก

### รันระบบ

```bash
npm run dev     # โหมดพัฒนา (Turbopack)
npm run build   # build สำหรับ production
npm run start   # รันเวอร์ชันที่ build แล้ว
```

เปิด [http://localhost:3000](http://localhost:3000)

## คำสั่งที่ใช้บ่อย

| คำสั่ง | ทำอะไร |
|---|---|
| `npm run lint` | ตรวจโค้ดด้วย ESLint |
| `npx prisma generate` | สร้าง Prisma Client ใหม่ (ต้องรันทุกครั้งที่แก้ `schema.prisma`) |
| `npx prisma migrate deploy` | apply migration ที่ยังไม่ได้รันเข้าฐานข้อมูล |

## หมายเหตุสำคัญ

- ข้อมูลพนักงาน (ชื่อ, เลขบัตรประชาชน, ค่าแรง, รูปถ่าย ฯลฯ) เป็นข้อมูลส่วนบุคคล (PII) — ห้าม commit เป็น seed/sample data โดยไม่ anonymize
- โปรเจกต์นี้พัฒนาแบบ iterative ร่วมกับผู้ใช้งานจริงต่อเนื่อง — ดูรายละเอียดการตัดสินใจเชิงสถาปัตยกรรม, ประวัติการแก้ไข และบั๊กที่เจอ/แก้ไปแล้วได้ใน `CLAUDE.md`
