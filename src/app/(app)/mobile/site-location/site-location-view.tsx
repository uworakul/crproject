"use client";

import { useState } from "react";
import SearchableSelect from "../../searchable-select";
import { getCurrentPosition, geolocationIsAllowedHere } from "../gps";

interface SiteRow {
  siteCode: string;
  siteName: string;
  location: { latitude: number; longitude: number; locationName: string; radiusMeters: number } | null;
}

const inputCls = "w-full rounded border border-gray-300 px-3 py-2 text-base disabled:bg-gray-100";
const btnCls = "w-full rounded px-4 py-3 text-base font-medium text-white disabled:opacity-50";

export default function SiteLocationView({ initialSites }: { initialSites: SiteRow[] }) {
  const [sites, setSites] = useState(initialSites);
  const [siteCode, setSiteCode] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationName, setLocationName] = useState("");
  const [radius, setRadius] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function pickSite(code: string) {
    setSiteCode(code);
    setMessage(null);
    const loc = sites.find((s) => s.siteCode === code)?.location;
    setLatitude(loc ? String(loc.latitude) : "");
    setLongitude(loc ? String(loc.longitude) : "");
    setLocationName(loc?.locationName ?? "");
    setRadius(loc ? String(loc.radiusMeters) : "");
  }

  async function useGps() {
    setMessage(null);
    setBusy(true);
    try {
      const fix = await getCurrentPosition();
      setLatitude(fix.latitude.toFixed(6));
      setLongitude(fix.longitude.toFixed(6));
      setMessage({ ok: true, text: `ได้ตำแหน่ง GPS แล้ว (ความแม่นยำประมาณ ${fix.accuracyMeters} เมตร) — กรอกชื่อสถานที่/ระยะแล้วกดบันทึก` });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "อ่าน GPS ไม่สำเร็จ" });
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setMessage(null);
    setBusy(true);
    try {
      const res = await fetch("/api/mobile/site-location", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteCode, latitude: Number(latitude), longitude: Number(longitude), locationName, radiusMeters: Number(radius) }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: body.message || body.error || "บันทึกไม่สำเร็จ" });
        return;
      }
      setSites((prev) =>
        prev.map((s) =>
          s.siteCode === siteCode ? { ...s, location: { latitude: Number(latitude), longitude: Number(longitude), locationName, radiusMeters: Number(radius) } } : s,
        ),
      );
      setMessage({ ok: true, text: "บันทึกพิกัดหน่วยงานแล้ว" });
    } finally {
      setBusy(false);
    }
  }

  const canSave = !!siteCode && latitude !== "" && longitude !== "" && Number(radius) > 0 && Number.isInteger(Number(radius));

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      {!geolocationIsAllowedHere() && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">
          หน้านี้ไม่ได้เปิดผ่าน https — เบราว์เซอร์จะไม่อนุญาตให้อ่าน GPS (ใช้ได้เฉพาะ https หรือ localhost) ยังกรอกพิกัดเองได้
        </p>
      )}
      <label className="block text-sm text-gray-700">
        หน่วยงาน
        <div className="mt-1">
          <SearchableSelect
            value={siteCode}
            onChange={pickSite}
            options={sites.map((s) => ({ code: s.siteCode, label: `${s.siteCode} — ${s.siteName}${s.location ? "" : " (ยังไม่ตั้งพิกัด)"}` }))}
            placeholder="เลือกหน่วยงาน"
          />
        </div>
      </label>

      {siteCode && (
        <>
          <button type="button" onClick={useGps} disabled={busy} className={`${btnCls} bg-blue-600`}>
            {busy ? "กำลังอ่านตำแหน่ง..." : "📍 ใช้ตำแหน่ง GPS ปัจจุบัน"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm text-gray-700">
              Latitude
              <input type="number" step="any" inputMode="decimal" className={`${inputCls} mt-1`} value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </label>
            <label className="block text-sm text-gray-700">
              Longitude
              <input type="number" step="any" inputMode="decimal" className={`${inputCls} mt-1`} value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </label>
          </div>
          <label className="block text-sm text-gray-700">
            ที่ตั้ง (Location)
            <input type="text" maxLength={200} className={`${inputCls} mt-1`} value={locationName} onChange={(e) => setLocationName(e.target.value)} />
          </label>
          <label className="block text-sm text-gray-700">
            ระยะห่างที่อนุญาตไม่เกิน (เมตร)
            <input type="number" step="1" min="1" inputMode="numeric" className={`${inputCls} mt-1`} value={radius} onChange={(e) => setRadius(e.target.value)} />
          </label>
          <button type="button" onClick={save} disabled={busy || !canSave} className={`${btnCls} bg-green-600`}>
            บันทึก
          </button>
        </>
      )}

      {message && <p className={`rounded p-3 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}
    </div>
  );
}
