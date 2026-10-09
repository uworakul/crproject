import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySession } from "@/lib/dal";
import { logAction } from "@/lib/audit-log";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireSelfEmployee } from "@/lib/mobile-auth";
import { consumeDocumentNumber } from "@/lib/document-number";
import { getMobileUniformData, todayInThailand } from "@/lib/mobile-requests";

export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  return apiSuccess(await getMobileUniformData(me.employee.EmpCode));
}

// POST { items: [{ productCode, qty }], remark? }: files a uniform purchase
// ("เบิกชุด (ซื้อ)") for the logged-in employee themself — an inv_issue_header
// created SUBMITTED with NO warehouse (the approver picks it before
// approving). Prices are always taken from inv_product.UnitPrice here, never
// from the client, and nothing is posted to stock until approval.
export async function POST(request: NextRequest) {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const me = await requireSelfEmployee(user);
  if ("error" in me) return me.error;
  const employee = me.employee;

  let body: { items?: unknown; remark?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError(400, "INVALID_PARAMS", "Request body must be JSON");
  }
  if (!Array.isArray(body.items) || body.items.length === 0) return apiError(400, "INVALID_PARAMS", "items must contain at least one product");
  if (body.items.length > 30) return apiError(400, "INVALID_PARAMS", "too many items");

  // Merge repeated products so one product is one line.
  const qtyByProduct = new Map<string, number>();
  for (const raw of body.items as { productCode?: unknown; qty?: unknown }[]) {
    const productCode = typeof raw?.productCode === "string" ? raw.productCode.trim() : "";
    const qty = Number(raw?.qty);
    if (!productCode || !Number.isFinite(qty) || qty <= 0 || qty > 1000) return apiError(400, "INVALID_PARAMS", "each item needs a productCode and qty between 0 and 1000");
    qtyByProduct.set(productCode, (qtyByProduct.get(productCode) ?? 0) + qty);
  }

  if (employee.EmployeeStatus !== "ACTIVE") {
    return apiError(409, "EMPLOYEE_NOT_ELIGIBLE", "This employee's status does not allow filing a new request", { employeeStatus: employee.EmployeeStatus });
  }
  const products = await prisma.invProduct.findMany({ where: { ProductCode: { in: [...qtyByProduct.keys()] }, IsActive: true, UnitPrice: { gt: 0 } } });
  const priceByProduct = new Map(products.map((p) => [p.ProductCode, Number(p.UnitPrice)]));
  for (const code of qtyByProduct.keys()) {
    if (!priceByProduct.has(code)) return apiError(404, "PRODUCT_NOT_FOUND", undefined, { productCode: code });
  }

  const documentNo = await consumeDocumentNumber("STOCKSALE", "จำหน่ายสินค้า");
  const created = await prisma.invIssueHeader.create({
    data: {
      DocumentNo: documentNo,
      WarehouseCode: null,
      DeliveryDate: todayInThailand(),
      EmpCode: employee.EmpCode,
      Remark: typeof body.remark === "string" && body.remark.trim() ? body.remark.trim().slice(0, 300) : null,
      Status: "SUBMITTED",
      SubmittedDate: new Date(),
      CreatedBy: user.userId,
      Details: {
        create: [...qtyByProduct].map(([productCode, qty]) => {
          const unitPrice = priceByProduct.get(productCode)!;
          return { ProductCode: productCode, Qty: qty, UnitPrice: unitPrice, Amount: qty * unitPrice, CreatedBy: user.userId };
        }),
      },
    },
  });
  await logAction(user.userId, "CREATE_STOCK_ISSUE", { targetTable: "inv_issue_header", targetId: String(created.IssueHeaderID), detail: "MOBILE (submitted)" });
  return apiSuccess({ issueHeaderId: created.IssueHeaderID, documentNo: created.DocumentNo }, 201);
}
