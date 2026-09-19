"use client";

import { useEffect, useRef, useState } from "react";

const inputCls = "rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100";

// Typeahead combobox for long option lists (e.g. Site) where a plain <select>
// makes finding one entry by name tedious. Value is the option's code;
// displays the matching label while closed, filters by label while typing.
export default function SearchableSelect({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  value: string;
  onChange: (code: string) => void;
  options: { code: string; label: string }[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const selected = options.find((o) => o.code === value);
  // Initialized once from the incoming value, same as the rest of this
  // page's form fields — every subsequent change to `value` originates from
  // this component's own onMouseDown handlers below, which already keep
  // `query` in sync directly, so no resync-from-props effect is needed.
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.label ?? "");
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  });

  const filtered = options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()) || o.code.toLowerCase().includes(query.toLowerCase()));

  return (
    <div ref={wrapRef} className="relative">
      <input
        disabled={disabled}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        className={`${inputCls} w-full`}
      />
      {open && !disabled && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded border border-gray-300 bg-white text-sm shadow-lg">
          <li
            className="cursor-pointer px-3 py-2 text-gray-400 hover:bg-gray-100"
            onMouseDown={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
          >
            - ไม่ระบุ -
          </li>
          {filtered.map((o) => (
            <li
              key={o.code}
              className="cursor-pointer px-3 py-2 hover:bg-gray-100"
              onMouseDown={() => {
                onChange(o.code);
                setQuery(o.label);
                setOpen(false);
              }}
            >
              {o.label}
            </li>
          ))}
          {filtered.length === 0 && <li className="px-3 py-2 text-gray-400">ไม่พบรายการ</li>}
        </ul>
      )}
    </div>
  );
}
