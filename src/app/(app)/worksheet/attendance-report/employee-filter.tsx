"use client";

import { useState } from "react";
import SearchableSelect from "../../searchable-select";

// Same searchable employee picker the payroll reports use (empty = everyone),
// wrapped so it can live inside this page's plain GET <form>: the chosen
// code travels as a hidden "emp" field.
export default function EmployeeFilter({ employees, initial }: { employees: { code: string; name: string }[]; initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-64">
      <SearchableSelect
        value={value}
        onChange={setValue}
        options={employees.map((e) => ({ code: e.code, label: `${e.code} — ${e.name}` }))}
        placeholder="ค้นหารหัส/ชื่อพนักงาน (เว้นว่าง = ทั้งหมด)"
      />
      <input type="hidden" name="emp" value={value} />
    </div>
  );
}
