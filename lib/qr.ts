import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

// PromptPay QR is a locally-computed EMVCo payload — no bank API needed.
export async function promptPayQrDataUrl(
  promptpayId: string,
  amount: number
): Promise<string> {
  const payload = generatePayload(promptpayId, { amount });
  return QRCode.toDataURL(payload, { width: 320, margin: 2 });
}
