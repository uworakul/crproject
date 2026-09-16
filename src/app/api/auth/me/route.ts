import { verifySession } from "@/lib/dal";
import { apiError, apiSuccess } from "@/lib/api-response";

export async function GET() {
  const user = await verifySession();
  if (!user) {
    return apiError(401, "UNAUTHORIZED");
  }
  return apiSuccess(user);
}
