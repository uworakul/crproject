// Browser-side GPS helper shared by the MOBILE screens. Only ever called from
// click handlers (never on mount) so the permission prompt appears in
// response to a user action.
export interface GpsFix {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export function getCurrentPosition(): Promise<GpsFix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("อุปกรณ์นี้ไม่รองรับ GPS"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyMeters: Math.round(pos.coords.accuracy) }),
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง กรุณาอนุญาตการเข้าถึงตำแหน่ง (Location) ในเบราว์เซอร์"
            : err.code === err.TIMEOUT
              ? "หาตำแหน่ง GPS ไม่ทันเวลา กรุณาลองใหม่ในที่โล่ง"
              : "ไม่สามารถอ่านตำแหน่ง GPS ได้ กรุณาเปิด GPS แล้วลองใหม่";
        reject(new Error(reason));
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}

// Browsers only expose geolocation on https:// or localhost — a plain-http
// LAN address (e.g. a phone opening http://192.168.x.x:3000) is refused
// silently, so the screens warn about it up front.
export function geolocationIsAllowedHere(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export const thaiDateTime = (d: string | Date) =>
  `${new Date(d).toLocaleDateString("th-TH", { dateStyle: "medium", timeZone: "Asia/Bangkok" })} ${new Date(d).toLocaleTimeString("th-TH", { hour12: false, hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }).replace(":", ".")}`;
