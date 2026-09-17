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
  items: NavItem[];
}

function isGroupActive(group: NavGroup, pathname: string) {
  return group.items.some((item) => pathname === item.href || pathname.startsWith(item.href + "/"));
}

export default function Sidebar({ groups }: { groups: NavGroup[] }) {
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

  return (
    <aside className={`flex shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] ${collapsed ? "w-14" : "w-60"}`}>
      <div className={`flex items-center pt-6 pb-4 ${collapsed ? "justify-center px-2" : "justify-between px-5"}`}>
        {!collapsed && (
          <div>
            <div className="text-lg font-semibold tracking-tight text-gray-900">CRPAYROLL</div>
            <div className="text-xs text-gray-400">ABC CO., LTD.</div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "แสดงเมนู" : "ซ่อนเมนู"}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
            <path fillRule="evenodd" d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 5A.75.75 0 012.75 9h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 9.75zm0 5a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
          </svg>
        </button>
      </div>
      {!collapsed && (
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
                {group.label}
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
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
