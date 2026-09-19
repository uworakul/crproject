"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
}
interface NavGroup {
  label: string;
  icon?: IconKey;
  items: NavItem[];
}

function isGroupActive(group: NavGroup, pathname: string) {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
}

export type IconKey = "users" | "settings" | "employee" | "approve" | "inventory" | "worksheet" | "payroll" | "leave";

// Simple line icons built from basic shapes (rect/circle/line/polygon) only —
// no bezier path data — one per top-level menu group, shown alongside the
// label when expanded and as the whole nav when collapsed to a rail.
function GroupIcon({ icon, className }: { icon: IconKey | undefined; className?: string }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (icon) {
    case "users":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <rect x="4" y="15" width="16" height="7" rx="3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <line x1="4" y1="6" x2="20" y2="6" />
          <circle cx="9" cy="6" r="2" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="15" cy="12" r="2" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="9" cy="18" r="2" />
        </svg>
      );
    case "employee":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="8" cy="10" r="2" />
          <line x1="6" y1="15" x2="10" y2="15" />
          <line x1="13" y1="9" x2="18" y2="9" />
          <line x1="13" y1="13" x2="18" y2="13" />
        </svg>
      );
    case "approve":
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <polyline points="8,13 11,16 16,9" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...common}>
          <polygon points="12,3 21,8 21,16 12,21 3,16 3,8" />
          <line x1="12" y1="12" x2="21" y2="8" />
          <line x1="12" y1="12" x2="3" y2="8" />
          <line x1="12" y1="12" x2="12" y2="21" />
        </svg>
      );
    case "worksheet":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="12" x2="12" y2="7" />
          <line x1="12" y1="12" x2="16" y2="14" />
        </svg>
      );
    case "payroll":
      return (
        <svg {...common}>
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <circle cx="12" cy="12" r="3" />
          <line x1="6" y1="9" x2="6" y2="9.01" />
          <line x1="18" y1="15" x2="18" y2="15.01" />
        </svg>
      );
    case "leave":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
          <line x1="9" y1="14" x2="15" y2="18" />
          <line x1="15" y1="14" x2="9" y2="18" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path
        fillRule="evenodd"
        d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function Sidebar({ groups, companyShortName }: { groups: NavGroup[]; companyShortName: string }) {
  const pathname = usePathname();
  // Groups containing the current page start open; the rest start
  // collapsed — click a group header to toggle it independently.
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(groups.map((g) => [g.label, isGroupActive(g, pathname)])),
  );
  const [collapsed, setCollapsed] = useState(false);

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  function expandToGroup(label: string) {
    setCollapsed(false);
    setOpen((prev) => ({ ...prev, [label]: true }));
  }

  return (
    <aside className={`flex shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] ${collapsed ? "w-16" : "w-60"}`}>
      {collapsed ? (
        <div className="flex flex-col items-center gap-3 pt-6 pb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">CR</div>
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="แสดงเมนู"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <HamburgerIcon className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-5 pt-6 pb-4">
          <div>
            <div className="text-lg font-semibold tracking-tight text-gray-900">CRPAYROLL</div>
            <div className="text-xs text-gray-400">{companyShortName}</div>
          </div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="ซ่อนเมนู"
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
          >
            <HamburgerIcon className="h-5 w-5" />
          </button>
        </div>
      )}

      {collapsed ? (
        <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto pt-2 pb-4">
          {groups.map((group) => {
            const active = isGroupActive(group, pathname);
            return (
              <button
                key={group.label}
                type="button"
                onClick={() => expandToGroup(group.label)}
                title={group.label}
                className={`flex h-10 w-10 items-center justify-center rounded-md ${
                  active ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <GroupIcon icon={group.icon} className="h-5 w-5" />
              </button>
            );
          })}
        </nav>
      ) : (
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group) => {
            const isOpen = open[group.label] ?? false;
            return (
              <div key={group.label} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                >
                  <span className="flex items-center gap-2">
                    <GroupIcon icon={group.icon} className="h-4 w-4 shrink-0" />
                    {group.label}
                  </span>
                  <svg
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path
                      fillRule="evenodd"
                      d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
                {isOpen && (
                  <div className="mb-4 flex flex-col gap-0.5 pt-1 pl-5">
                    {group.items.map((item) => {
                      const active = pathname === item.href || pathname.startsWith(item.href + "/");
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={`rounded-md px-2.5 py-1.5 text-sm ${
                            active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      )}
    </aside>
  );
}
