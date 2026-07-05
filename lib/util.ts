import { createHmac, timingSafeEqual } from "crypto";

// Thai numerals → arabic, trim, collapse spaces, uppercase.
// Carried over from GAS: room matching on normalized key is the #1 latent bug there.
export function normalizeRoomNo(s: string): string {
  const thai = "๐๑๒๓๔๕๖๗๘๙";
  return s
    .trim()
    .replace(/[๐-๙]/g, (d) => String(thai.indexOf(d)))
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export const fmtMoney = (n: number) =>
  n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const currentPeriod = () => new Date().toISOString().slice(0, 7); // YYYY-MM

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function fmtPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

// Stateless HMAC-signed tenant links (carried from GAS, plus expiry which GAS lacked).
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";

export function signPayload(payload: string, expDays = 30): string {
  const exp = Date.now() + expDays * 86400_000;
  const data = `${payload}|${exp}`;
  const sig = createHmac("sha256", SECRET).update(data).digest("base64url");
  return Buffer.from(data).toString("base64url") + "." + sig;
}

export function verifyPayload(token: string): string | null {
  const [data64, sig] = token.split(".");
  if (!data64 || !sig) return null;
  const data = Buffer.from(data64, "base64url").toString();
  const expected = createHmac("sha256", SECRET).update(data).digest("base64url");
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  const i = data.lastIndexOf("|");
  if (Number(data.slice(i + 1)) < Date.now()) return null;
  return data.slice(0, i);
}
