"use client";

import { useEffect, useRef, useState } from "react";
import Swal from "sweetalert2";
import { getCurrentPosition, geolocationIsAllowedHere, thaiDateTime } from "./gps";
import type { AttendanceState } from "@/lib/mobile-attendance";

// Within this distance of the site point the distance is not worth showing.
const SHOW_DISTANCE_OVER = 30;
const distText = (m: number) => (m > SHOW_DISTANCE_OVER ? ` (ห่าง ${m} เมตร)` : "");

type Result = { ok: true; time: string; siteName: string; distanceMeters: number } | { ok: false; reason: string };

// One component for both screens: mode "IN" (เข้างาน, pick a site, CHECK-IN)
// and mode "OUT" (เลิกงาน, CHECK-OUT against the site the open shift started at).
export default function AttendanceView({ mode, initial }: { mode: "IN" | "OUT"; initial: AttendanceState }) {
  const [state, setState] = useState(initial);
  // Site is auto-detected from GPS (check-in only); the server re-detects on submit.
  const [detected, setDetected] = useState<{ found: true; siteCode: string; siteName: string; distanceMeters: number } | { found: false; message: string } | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  // Live camera only — no <input type="file">, so a photo can't be picked
  // from the device's gallery. The stream is opened from a click handler and
  // the frame is grabbed onto a canvas, which emits JPEG.
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }
  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function openCamera() {
    if (isIn) void detectSite();
    setCameraError(null);
    setResult(null);
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("อุปกรณ์/เบราว์เซอร์นี้ไม่รองรับการเปิดกล้อง (ต้องเปิดผ่าน https)");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      // The <video> mounts on the next render; attach the stream right after.
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setCameraError("เปิดกล้องไม่ได้ กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์แล้วลองใหม่");
    }
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    // Downscale so the upload stays small on mobile data (max 1024px wide).
    const scale = Math.min(1, 1024 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("ถ่ายรูปไม่สำเร็จ กรุณาลองใหม่");
          return;
        }
        setPhoto({ blob, url: URL.createObjectURL(blob) });
        stopCamera();
      },
      "image/jpeg",
      0.8,
    );
  }

  const isIn = mode === "IN";
  const label = isIn ? "CHECK-IN" : "CHECK-OUT";
  const color = isIn ? "bg-green-600" : "bg-red-600";

  async function detectSite() {
    setDetecting(true);
    setDetected(null);
    try {
      const fix = await getCurrentPosition();
      const res = await fetch(`/api/mobile/detect-site?lat=${fix.latitude}&lng=${fix.longitude}`);
      const body = await res.json();
      if (!res.ok) setDetected({ found: false, message: body.message || body.error || "ตรวจหาหน่วยงานไม่สำเร็จ" });
      else setDetected(body.found ? { found: true, siteCode: body.siteCode, siteName: body.siteName, distanceMeters: body.distanceMeters } : { found: false, message: body.message });
    } catch (err) {
      setDetected({ found: false, message: err instanceof Error ? err.message : "อ่าน GPS ไม่สำเร็จ" });
    } finally {
      setDetecting(false);
    }
  }

  async function submit() {
    setResult(null);
    const target = isIn ? (detected?.found ? detected.siteName : undefined) : state.open?.siteName;
    const confirm = await Swal.fire({
      icon: "question",
      title: `ยืนยัน ${label}?`,
      text: target ? `หน่วยงาน: ${target}` : undefined,
      showCancelButton: true,
      confirmButtonText: "ยืนยัน",
      cancelButtonText: "ยกเลิก",
      confirmButtonColor: isIn ? "#16a34a" : "#dc2626",
    });
    if (!confirm.isConfirmed) return;

    setBusy(true);
    try {
      let fix;
      try {
        fix = await getCurrentPosition();
      } catch (err) {
        setResult({ ok: false, reason: err instanceof Error ? err.message : "อ่าน GPS ไม่สำเร็จ" });
        return;
      }
      const form = new FormData();
      form.append("action", isIn ? "CHECK_IN" : "CHECK_OUT");
      form.append("latitude", String(fix.latitude));
      form.append("longitude", String(fix.longitude));
      form.append("photo", photo!.blob, "photo.jpg");
      const res = await fetch("/api/mobile/attendance", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setResult({ ok: false, reason: body.message || body.error || "ไม่สามารถทำรายการได้" });
        return;
      }
      setResult({ ok: true, time: body.time, siteName: body.siteName, distanceMeters: body.distanceMeters });
      // The photo is spent — a fresh one is needed for the next action.
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(null);
      // Reflect the new open/closed state without a reload.
      setState((prev) => ({
        ...prev,
        open: isIn ? { attendanceId: 0, siteCode: body.siteCode, siteName: body.siteName, checkInTime: body.time } : null,
      }));
    } finally {
      setBusy(false);
    }
  }

  const blockedReason = isIn
    ? state.open
      ? `คุณ Check-in อยู่แล้วที่ ${state.open.siteName} (${thaiDateTime(state.open.checkInTime)}) — ต้อง Check-out ก่อน`
      : null
    : !state.open
      ? "ยังไม่ได้ Check-in จึงไม่สามารถ Check-out ได้"
      : null;

  return (
    <div className="mt-5 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      {!geolocationIsAllowedHere() && (
        <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">หน้านี้ไม่ได้เปิดผ่าน https — เบราว์เซอร์จะไม่อนุญาตให้อ่าน GPS จึงบันทึกเวลาไม่ได้ (ใช้ได้เฉพาะ https หรือ localhost)</p>
      )}

      {isIn ? (
        <div className="space-y-2 rounded bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-medium">หน่วยงาน (ตรวจจากตำแหน่ง GPS อัตโนมัติ)</div>
          {!detected && !detecting && state.lastSite && (
            <div className="text-gray-600">หน่วยงานล่าสุดที่ Check-out: {state.lastSite.siteName}</div>
          )}
          {detecting && <div>กำลังตรวจหาหน่วยงาน...</div>}
          {detected?.found && (
            <div className="text-green-800">
              📍 {detected.siteName}{distText(detected.distanceMeters)}
            </div>
          )}
          {detected && !detected.found && <div className="text-red-700">{detected.message}</div>}
          <button type="button" onClick={detectSite} disabled={detecting || busy} className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50">
            📍 ตรวจหาหน่วยงาน
          </button>
        </div>
      ) : (
        state.open && (
          <div className="rounded bg-gray-50 p-3 text-sm text-gray-700">
            <div>
              หน่วยงานที่ Check-in: <span className="font-medium">{state.open.siteName}</span>
            </div>
            <div>เวลาเข้างาน: {thaiDateTime(state.open.checkInTime)}</div>
            {detecting && <div className="mt-2">กำลังตรวจหาหน่วยงาน...</div>}
            {detected?.found && (
              <div className={`mt-2 ${detected.siteCode === state.open.siteCode ? "text-green-800" : "text-amber-700"}`}>
                📍 ตำแหน่งปัจจุบัน: {detected.siteName}{distText(detected.distanceMeters)}
                {detected.siteCode !== state.open.siteCode && " — ไม่ใช่หน่วยงานที่ Check-in"}
              </div>
            )}
            {detected && !detected.found && <div className="mt-2 text-red-700">{detected.message}</div>}
            <button type="button" onClick={detectSite} disabled={detecting || busy} className="mt-2 rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 disabled:opacity-50">
              📍 ตรวจหาหน่วยงาน
            </button>
          </div>
        )
      )}

      {blockedReason && <p className="rounded bg-amber-50 p-3 text-sm text-amber-800">{blockedReason}</p>}

      {!blockedReason && (
        <div className="space-y-2 rounded border border-gray-200 p-3">
          <div className="text-sm font-medium text-gray-700">ถ่ายรูปยืนยัน{isIn ? "การเข้างาน" : "การเลิกงาน"}</div>
          {cameraOn && (
            <>
              <video ref={videoRef} playsInline muted className="w-full rounded bg-black" />
              <button type="button" onClick={capture} className="w-full rounded bg-blue-600 px-4 py-3 text-base font-medium text-white">
                📷 ถ่ายรูป
              </button>
            </>
          )}
          {photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo.url} alt="รูปที่ถ่าย" className="w-full rounded" />
          )}
          {!cameraOn && (
            <button type="button" onClick={openCamera} disabled={busy} className="w-full rounded border border-blue-600 px-4 py-3 text-base font-medium text-blue-700 disabled:opacity-50">
              {photo ? "ถ่ายใหม่" : "เปิดกล้อง"}
            </button>
          )}
          {cameraError && <p className="text-sm text-red-700">{cameraError}</p>}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !!blockedReason || (isIn && detected?.found === false) || !photo}
        className={`w-full rounded px-4 py-5 text-xl font-semibold text-white disabled:opacity-40 ${color}`}
      >
        {busy ? "กำลังบันทึก..." : !photo && !blockedReason ? `ถ่ายรูปก่อน ${label}` : label}
      </button>

      {result &&
        (result.ok ? (
          <div className="rounded border border-green-300 bg-green-50 p-4 text-green-900">
            <div className="text-lg font-semibold">✔ {label} สำเร็จ</div>
            <div className="mt-1 text-sm">เวลาที่บันทึก: {thaiDateTime(result.time)}</div>
            <div className="text-sm">หน่วยงาน: {result.siteName}</div>
            {result.distanceMeters > SHOW_DISTANCE_OVER && <div className="text-sm">ห่างจากจุดที่กำหนด {result.distanceMeters} เมตร</div>}
          </div>
        ) : (
          <div className="rounded border border-red-300 bg-red-50 p-4 text-red-800">
            <div className="text-lg font-semibold">✖ ไม่สามารถทำรายการ</div>
            <div className="mt-1 text-sm">สาเหตุ: {result.reason}</div>
          </div>
        ))}
    </div>
  );
}
