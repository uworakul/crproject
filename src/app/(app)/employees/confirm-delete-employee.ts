import Swal from "sweetalert2";

// Shared by the employee list page's "ลบ" button and the detail page's
// "ลบออกจากระบบ" button — one dialog doubles as both the reason input and
// the confirm step (inputValidator blocks an empty reason).
export async function confirmDeleteEmployee(empCode: string, fullName: string): Promise<string | null> {
  const { value, isConfirmed } = await Swal.fire({
    title: "ลบพนักงานออกจากระบบ",
    html: `<div class="text-sm text-gray-600">${empCode} — ${fullName}</div>`,
    input: "text",
    inputLabel: "ระบุสาเหตุการลบ",
    inputPlaceholder: "เช่น กรอกข้อมูลผิดพลาด, สร้างซ้ำ ฯลฯ",
    inputValidator: (v) => (!v || !v.trim() ? "กรุณาระบุสาเหตุการลบ" : undefined),
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "ยืนยันการลบ",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#dc2626",
    cancelButtonColor: "#9ca3af",
  });
  return isConfirmed && typeof value === "string" ? value.trim() : null;
}
