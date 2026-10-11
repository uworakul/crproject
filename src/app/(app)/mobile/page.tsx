import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal";
import { canManageSiteLocation } from "@/lib/mobile-auth";

type IconName = "in" | "out" | "list" | "leave" | "advance" | "uniform" | "payslip" | "pin";

function TileIcon({ name }: { name: IconName }) {
  const c = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className: "h-6 w-6" };
  switch (name) {
    case "in":
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="8,12 11,15 16,9" />
        </svg>
      );
    case "out":
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="12" x2="12" y2="7" />
          <line x1="12" y1="12" x2="16" y2="14" />
        </svg>
      );
    case "list":
      return (
        <svg {...c}>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <line x1="8" y1="8" x2="16" y2="8" />
          <line x1="8" y1="12" x2="16" y2="12" />
          <line x1="8" y1="16" x2="13" y2="16" />
        </svg>
      );
    case "leave":
      return (
        <svg {...c}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
      );
    case "advance":
      return (
        <svg {...c}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case "uniform":
      return (
        <svg {...c}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <line x1="12" y1="12" x2="21" y2="8" />
          <line x1="12" y1="12" x2="3" y2="8" />
          <line x1="12" y1="12" x2="12" y2="21" />
        </svg>
      );
    case "payslip":
      return (
        <svg {...c}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="7" x2="12" y2="17" />
          <path d="M15 9.5c-.5-1-1.7-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.3 0-2.5-.5-3-1.5" />
        </svg>
      );
    case "pin":
      return (
        <svg {...c}>
          <circle cx="12" cy="10" r="3" />
          <path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z" />
        </svg>
      );
  }
}

interface Tile {
  href: string;
  label: string;
  icon: IconName;
}

// MOBILE home — the tile menu from the brand artwork (blue header, greeting
// card, 2-column grid of rounded white tiles). Same role gating as the sidebar
// MOBILE group: self-service tiles for EMPLOYEE, site coordinates for
// SITE_HEAD/ADMIN/APPROVER; hidden entirely while the system is locked.
export default async function MobileHome() {
  const user = await verifySession();
  if (!user) redirect("/login");

  const tiles: Tile[] = user.systemLocked
    ? []
    : [
        ...(canManageSiteLocation(user) ? [{ href: "/mobile/site-location", label: "พิกัดหน่วยงาน", icon: "pin" as const }] : []),
        ...(user.role === "EMPLOYEE"
          ? ([
              { href: "/mobile/check-in", label: "เข้างาน", icon: "in" },
              { href: "/mobile/check-out", label: "เลิกงาน", icon: "out" },
              { href: "/mobile/attendance-list", label: "รายการลงเวลางาน", icon: "list" },
              { href: "/mobile/leave", label: "ใบลา", icon: "leave" },
              { href: "/mobile/advance", label: "ขอเบิกล่วงหน้า", icon: "advance" },
              { href: "/mobile/uniform", label: "ขอเบิกชุด (ซื้อ)", icon: "uniform" },
              { href: "/mobile/payslip", label: "Payslip", icon: "payslip" },
            ] as Tile[])
          : []),
      ];

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="bg-gradient-to-b from-[#1366d6] to-[#0a3d91] px-4 pt-5 pb-14 text-white md:rounded-b-3xl">
        <div className="text-sm font-bold tracking-wide">CRPAYROLL</div>
      </div>

      <div className="-mt-10 px-4 pb-8">
        <div className="rounded-2xl bg-white p-4 shadow-md shadow-blue-900/10">
          <div className="text-base font-semibold text-[#0b2a66]">สวัสดีค่ะ</div>
          <div className="text-xs text-gray-500">{user.displayName} · ระบบเงินเดือนและบุคคล</div>
        </div>

        {tiles.length === 0 ? (
          <p className="mt-6 text-center text-sm text-gray-500">ไม่มีเมนูที่ใช้งานได้</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            {tiles.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-blue-100 bg-white px-3 py-5 text-center shadow-sm shadow-blue-900/5 transition hover:bg-blue-50 active:scale-[0.98]"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#e9f0fc] text-[#1366d6]">
                  <TileIcon name={t.icon} />
                </span>
                <span className="text-xs font-medium text-[#0b2a66]">{t.label}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
