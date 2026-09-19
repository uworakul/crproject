import { verifySession } from "@/lib/dal";
import { requirePermission } from "@/lib/authorize";
import { apiError, apiSuccess } from "@/lib/api-response";
import { findNextFreeEmployeeCode } from "@/lib/document-number";

// Pure preview for the "Add Employee" form's EmpCode prefill — does not
// touch ref_document_number.LatestNumber. That only advances when the code
// is actually consumed by a successful POST /api/employees.
export async function GET() {
  const user = await verifySession();
  if (!user) return apiError(401, "UNAUTHORIZED");
  const denied = await requirePermission(user, "EMPLOYEE", "save");
  if (denied) return denied;

  const result = await findNextFreeEmployeeCode("NEW_EMPNO");
  return apiSuccess({ code: result?.code ?? null });
}
