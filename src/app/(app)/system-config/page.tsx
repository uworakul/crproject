import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { hasPermission } from "@/lib/authorize";
import { getOrCreateSystemConfig } from "@/lib/system-config";
import SystemConfigForm from "./system-config-form";

export default async function SystemConfigPage() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const canRead = await hasPermission(user, "SYS_CONFIG", "read");
  if (!canRead) redirect("/");

  const [canSave, config] = await Promise.all([hasPermission(user, "SYS_CONFIG", "save"), getOrCreateSystemConfig()]);

  return (
    <div className="w-full px-6 py-8">
      <h1 className="mb-6 text-lg font-semibold text-gray-900">System Configuration</h1>
      <SystemConfigForm config={JSON.parse(JSON.stringify(config))} canSave={canSave} />
    </div>
  );
}
