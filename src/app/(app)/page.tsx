import { verifySession } from "@/lib/dal";

export default async function Home() {
  const user = await verifySession();

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold text-gray-900">สวัสดี, {user?.displayName}</h1>
      <p className="mt-1 text-sm text-gray-500">เลือกเมนูจากด้านซ้ายเพื่อเริ่มใช้งาน</p>
    </div>
  );
}
