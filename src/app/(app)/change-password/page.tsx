import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import ChangePasswordForm from "./change-password-form";

export default async function ChangePasswordPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  return (
    <div className="p-6">
      <h1 className="mb-2 text-xl font-semibold">เปลี่ยนรหัสผ่าน</h1>
      <p className="mb-6 text-sm text-gray-600">บัญชีผู้ใช้: {user.userId} — {user.displayName}</p>
      <ChangePasswordForm userId={user.userId} />
    </div>
  );
}
