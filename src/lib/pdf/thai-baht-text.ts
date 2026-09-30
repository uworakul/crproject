// Amount in baht -> Thai words ("หนึ่งพันสองร้อยบาทถ้วน"), used by the 50ทวิ
// certificate's "รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)" line.
const DIGITS = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const UNITS = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

function readBelowMillion(digits: string): string {
  let out = "";
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const d = Number(digits[i]);
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 1 && d === 1) out += "สิบ";
    else out += DIGITS[d] + UNITS[pos];
  }
  return out;
}

function readInteger(n: string): string {
  const trimmed = n.replace(/^0+/, "");
  if (trimmed === "") return DIGITS[0];
  const chunks: string[] = [];
  for (let end = trimmed.length; end > 0; end -= 6) chunks.unshift(trimmed.slice(Math.max(0, end - 6), end));
  return chunks
    .map((c, i) => {
      const text = readBelowMillion(c.replace(/^0+(?=\d)/, ""));
      return text === "" ? "" : text + (i < chunks.length - 1 ? "ล้าน" : "");
    })
    .join("");
}

export function thaiBahtText(amount: number | string): string {
  const [bahtRaw, satangRaw = "0"] = Number(amount).toFixed(2).split(".");
  const baht = readInteger(bahtRaw);
  const satang = Number(satangRaw);
  if (satang === 0) return `${baht}บาทถ้วน`;
  return `${Number(bahtRaw) === 0 ? "" : baht + "บาท"}${readBelowMillion(String(satang))}สตางค์`;
}
