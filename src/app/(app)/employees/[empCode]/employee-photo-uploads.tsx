"use client";

import { useRef, useState } from "react";

type PhotoType = "EMPLOYEE" | "IDCARD";

function PhotoBox({
  type,
  label,
  empCode,
  exists,
  busy,
  canSave,
  cacheBust,
  onClick,
  onInputRef,
  onFileChange,
}: {
  type: PhotoType;
  label: string;
  empCode: string;
  exists: boolean;
  busy: boolean;
  canSave: boolean;
  cacheBust: number;
  onClick: () => void;
  onInputRef: (el: HTMLInputElement | null) => void;
  onFileChange: (file: File | undefined) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        disabled={!canSave || busy}
        onClick={onClick}
        className="flex h-20 w-20 items-center justify-center overflow-hidden rounded border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400 hover:border-gray-400 disabled:cursor-default disabled:hover:border-gray-300"
      >
        {exists ? (
          // eslint-disable-next-line @next/next/no-img-element -- served from our own authenticated proxy route, not a static/remote asset Next's Image optimizer can pre-configure a domain for
          <img
            key={cacheBust}
            src={`/api/employees/${empCode}/photo?type=${type}&v=${cacheBust}`}
            alt={label}
            className="h-full w-full object-cover"
          />
        ) : busy ? (
          "กำลังอัปโหลด..."
        ) : (
          "+ อัปโหลด"
        )}
      </button>
      <span className="text-xs text-gray-500">{label}</span>
      <input
        ref={onInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => onFileChange(e.target.files?.[0])}
      />
    </div>
  );
}

// สองกล่องรูป (2026-09-21): รูปพนักงาน/รูปบัตรประชาชน — คลิกกล่องเพื่อ Browse
// ไฟล์จากเครื่อง แล้วอัปโหลดไปเก็บใน Google Drive โฟลเดอร์ที่ผู้ดูแลตั้งไว้ที่
// System Configuration (POST /api/employees/[empCode]/photo?type=...) — แสดง
// รูปปัจจุบันผ่าน GET เดียวกัน (proxy ผ่าน backend เสมอ ไม่ใช่ Drive link ตรงๆ
// เพราะเป็น PII) `cacheBust` บังคับให้ <img> โหลดรูปใหม่ทันทีหลังอัปโหลดสำเร็จ
// (URL เดิมจะถูก browser cache ไว้ไม่งั้น)
export default function EmployeePhotoUploads({ empCode, hasPhoto, hasIdCardPhoto, canSave }: { empCode: string; hasPhoto: boolean; hasIdCardPhoto: boolean; canSave: boolean }) {
  const fileInputs = useRef<Record<PhotoType, HTMLInputElement | null>>({ EMPLOYEE: null, IDCARD: null });
  const [exists, setExists] = useState<Record<PhotoType, boolean>>({ EMPLOYEE: hasPhoto, IDCARD: hasIdCardPhoto });
  const [cacheBust, setCacheBust] = useState<Record<PhotoType, number>>({ EMPLOYEE: 0, IDCARD: 0 });
  const [pending, setPending] = useState<PhotoType | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(type: PhotoType, file: File | undefined) {
    if (!file) return;
    setError(null);
    setPending(type);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch(`/api/employees/${empCode}/photo?type=${type}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.message || body.error);
        return;
      }
      setExists((prev) => ({ ...prev, [type]: true }));
      setCacheBust((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-3">
        <PhotoBox
          type="EMPLOYEE"
          label="รูปพนักงาน"
          empCode={empCode}
          exists={exists.EMPLOYEE}
          busy={pending === "EMPLOYEE"}
          canSave={canSave}
          cacheBust={cacheBust.EMPLOYEE}
          onClick={() => fileInputs.current.EMPLOYEE?.click()}
          onInputRef={(el) => {
            fileInputs.current.EMPLOYEE = el;
          }}
          onFileChange={(file) => handleFileChange("EMPLOYEE", file)}
        />
        <PhotoBox
          type="IDCARD"
          label="รูปบัตรประชาชน"
          empCode={empCode}
          exists={exists.IDCARD}
          busy={pending === "IDCARD"}
          canSave={canSave}
          cacheBust={cacheBust.IDCARD}
          onClick={() => fileInputs.current.IDCARD?.click()}
          onInputRef={(el) => {
            fileInputs.current.IDCARD = el;
          }}
          onFileChange={(file) => handleFileChange("IDCARD", file)}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
