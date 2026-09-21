/**
 * sys_menu seed data — one row per leaf menu in CRPAYROLL_Site_Map.html,
 * at leaf-menu granularity (confirmed 2026-09-16). Module 8 (legacy
 * Client-Server infra) is excluded — not applicable to the new system.
 *
 * Exception: Module 9 (Worksheet) has 5 leaves in the site map, but BR-045
 * already fixed a single DocumentType='WORKSHEET' for the whole module —
 * seeding 5 separate types here would contradict that approved decision,
 * so all of Worksheet's leaves share one row.
 */
export const menuSeed = [
  // System Configuration (2026-09-21) — new top-most menu, not part of the
  // original 9-module scope. Singleton settings row (sys_config).
  { DocumentType: "SYS_CONFIG", MenuNameTH: "ตั้งค่าระบบ", MenuNameEN: "System Configuration", ModuleGroup: "SYS_CONFIG" },

  // Module 1 — ผู้ใช้งานและสิทธิ์ (BR-001–004)
  { DocumentType: "AUTHORIZATION", MenuNameTH: "ภาพรวมสิทธิ์", MenuNameEN: "Authorization Overview", ModuleGroup: "AUTHORIZATION" },
  { DocumentType: "USER", MenuNameTH: "ผู้ใช้งาน", MenuNameEN: "User", ModuleGroup: "AUTHORIZATION" },
  { DocumentType: "USER_COPY", MenuNameTH: "คัดลอกชุดสิทธิ์", MenuNameEN: "User Copy", ModuleGroup: "AUTHORIZATION" },

  // Module 2 — ตั้งค่าระบบและรหัสอ้างอิง (BR-005–009)
  { DocumentType: "PERIOD", MenuNameTH: "งวดจ่ายเงินเดือน", MenuNameEN: "Period", ModuleGroup: "SYSTEM_SETTING" },
  { DocumentType: "PROCESS_LOG", MenuNameTH: "ประวัติการทำรายการ", MenuNameEN: "Process Log", ModuleGroup: "SYSTEM_SETTING" },
  { DocumentType: "CHANGE_EMPLOYEE_NO", MenuNameTH: "เปลี่ยนรหัสพนักงาน", MenuNameEN: "Change Employee No.", ModuleGroup: "SYSTEM_SETTING" },
  { DocumentType: "REFERENCE", MenuNameTH: "รหัสอ้างอิง (ธนาคาร/แผนก/ตำแหน่ง/SSO/Black List)", MenuNameEN: "Reference (Bank/Dept/Position/SSO/Black List)", ModuleGroup: "SYSTEM_SETTING" },
  { DocumentType: "TAX_RATE", MenuNameTH: "ภาษี/ค่าลดหย่อน/กองทุนฯ", MenuNameEN: "Tax & Rate & Fund", ModuleGroup: "SYSTEM_SETTING" },
  { DocumentType: "INCOME_DEDUCTION", MenuNameTH: "รายได้และรายการหัก", MenuNameEN: "Income & Deduction Types", ModuleGroup: "SYSTEM_SETTING" },

  // Module 3 — ข้อมูลหลักพนักงาน (BR-010–014)
  { DocumentType: "EMPLOYEE", MenuNameTH: "ทะเบียนพนักงาน", MenuNameEN: "Employee", ModuleGroup: "EMPLOYEE_MASTER" },
  { DocumentType: "EMPLOYEE_HISTORY", MenuNameTH: "ประวัติการแก้ไขพนักงาน", MenuNameEN: "Employee History", ModuleGroup: "EMPLOYEE_MASTER" },
  { DocumentType: "EMPLOYEE_PAYROLL", MenuNameTH: "ประวัติจ่ายเงินเดือนรายบุคคล", MenuNameEN: "Employee Payroll History", ModuleGroup: "EMPLOYEE_MASTER" },

  // Module 4 — การขออนุมัติ (BR-015–019)
  { DocumentType: "REQUEST_ADVANCE", MenuNameTH: "เบิกเงินล่วงหน้า", MenuNameEN: "Request - Advance", ModuleGroup: "REQUEST_APPROVE" },
  { DocumentType: "REQUEST_LOAN", MenuNameTH: "เงินกู้", MenuNameEN: "Request - Loan", ModuleGroup: "REQUEST_APPROVE" },
  { DocumentType: "REQUEST_TRAINING", MenuNameTH: "ค่าอบรม", MenuNameEN: "Request - Training", ModuleGroup: "REQUEST_APPROVE" },
  { DocumentType: "DRAFT_LIST", MenuNameTH: "รายการรออนุมัติ", MenuNameEN: "Draft List", ModuleGroup: "REQUEST_APPROVE" },

  // Module 5 — สินค้าคงคลัง/เครื่องแบบ (BR-020–027)
  { DocumentType: "SUPPLIER", MenuNameTH: "ผู้จำหน่าย", MenuNameEN: "Supplier", ModuleGroup: "INVENTORY" },
  { DocumentType: "WAREHOUSE", MenuNameTH: "คลังสินค้า", MenuNameEN: "Warehouse", ModuleGroup: "INVENTORY" },
  { DocumentType: "PRODUCT", MenuNameTH: "สินค้า", MenuNameEN: "Product", ModuleGroup: "INVENTORY" },
  { DocumentType: "STOCK_COUNT", MenuNameTH: "ตรวจนับสต๊อก", MenuNameEN: "Stock Count", ModuleGroup: "INVENTORY" },
  { DocumentType: "STOCK_PURCHASE", MenuNameTH: "ซื้อสินค้า", MenuNameEN: "Stock Purchase", ModuleGroup: "INVENTORY" },
  { DocumentType: "STOCK_TRANSFER", MenuNameTH: "โอนสินค้า", MenuNameEN: "Stock Transfer", ModuleGroup: "INVENTORY" },
  { DocumentType: "STOCK_ISSUE", MenuNameTH: "จำหน่ายสินค้า", MenuNameEN: "Stock Issue", ModuleGroup: "INVENTORY" },
  { DocumentType: "STOCK_RETURN", MenuNameTH: "คืนสินค้า", MenuNameEN: "Stock Return", ModuleGroup: "INVENTORY" },

  // Module 6 — คำนวณและจ่ายเงินเดือน (BR-028–034)
  { DocumentType: "SITE", MenuNameTH: "หน่วยงานลูกค้า", MenuNameEN: "Site", ModuleGroup: "PAYROLL" },
  { DocumentType: "PAYROLL_TRANSACTION", MenuNameTH: "รายการประจำงวด", MenuNameEN: "Payroll Transaction", ModuleGroup: "PAYROLL" },
  { DocumentType: "PAYROLL_CALCULATE", MenuNameTH: "คำนวณเงินเดือน", MenuNameEN: "Payroll Calculate", ModuleGroup: "PAYROLL" },
  { DocumentType: "PAYROLL_CANCEL_CALCULATE", MenuNameTH: "ยกเลิกการคำนวณ", MenuNameEN: "Cancel Calculate", ModuleGroup: "PAYROLL" },
  { DocumentType: "PAYROLL_LOCK", MenuNameTH: "ล็อกยอดจ่าย", MenuNameEN: "Payroll Lock", ModuleGroup: "PAYROLL" },
  { DocumentType: "PAYROLL_REPORT", MenuNameTH: "รายงานเงินเดือน", MenuNameEN: "Payroll Report", ModuleGroup: "PAYROLL" },
  { DocumentType: "PAYROLL_CLOSING", MenuNameTH: "ปิดงวด", MenuNameEN: "Payroll Closing", ModuleGroup: "PAYROLL" },

  // Module 7 — การลาและประวัติการลา (BR-035–037)
  { DocumentType: "LEAVE_REQUEST", MenuNameTH: "ใบลา", MenuNameEN: "Leave Request", ModuleGroup: "LEAVE" },
  { DocumentType: "LEAVE_REPORT", MenuNameTH: "รายงานประวัติการลา", MenuNameEN: "Leave History Report", ModuleGroup: "LEAVE" },

  // Module 9 — ใบลงเวลาปฏิบัติงานประจำเดือน (BR-040–047) — single DocumentType per BR-045
  { DocumentType: "WORKSHEET", MenuNameTH: "ใบลงเวลาปฏิบัติงานประจำเดือน", MenuNameEN: "Worksheet", ModuleGroup: "WORKSHEET" },
] as const;
