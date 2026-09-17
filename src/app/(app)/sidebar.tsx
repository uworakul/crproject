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

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="px-5 pb-4 pt-6">
        <div className="text-lg font-semibold tracking-tight text-gray-900">CRPAYROLL</div>
        <div className="text-xs text-gray-400">ABC CO., LTD.</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((group) => {
          const isOpen = open[group.label] ?? false;
          return (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                onClick={() => toggle(group.label)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-900"
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
                <div className="mb-4 flex flex-col gap-0.5 pt-1">
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
    </aside>
  );
}
