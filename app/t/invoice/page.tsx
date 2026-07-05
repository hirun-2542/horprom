import { sql } from "@/lib/db";
import { verifyPayload, fmtMoney, fmtPeriod } from "@/lib/util";
import { deriveStatus, STATUS_TH, type InvoiceRow } from "@/lib/billing";
import { promptPayQrDataUrl } from "@/lib/qr";
import { StatusBadge } from "@/components/status-badge";

export const dynamic = "force-dynamic";

export default async function TenantInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const payload = verifyPayload(sp.token ?? "");

  if (!payload?.startsWith("invoice|")) {
    return (
      <Shell>
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาติดต่อเจ้าของหอพัก
        </p>
      </Shell>
    );
  }

  const invoiceId = Number(payload.split("|")[1]);
  const inv = (
    await sql()<InvoiceRow[]>`
      SELECT i.*, COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id = i.id), 0)::numeric(12,2) AS paid
       FROM invoices i WHERE i.id = ${invoiceId}`
  )[0];
  if (!inv || inv.status === "void") {
    return (
      <Shell>
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">ไม่พบใบแจ้งหนี้นี้</p>
      </Shell>
    );
  }

  const items = await sql()<{ description: string; quantity: number | null; unit_price: number | null; amount: number }[]>`
    SELECT description, quantity, unit_price, amount FROM invoice_items WHERE invoice_id = ${inv.id} ORDER BY id`;
  const dorm = (
    await sql()<{ name: string; promptpay_id: string | null }[]>`
      SELECT name, promptpay_id FROM dorms WHERE id = ${inv.dorm_id}`
  )[0];

  const status = deriveStatus(inv);
  const balance = Math.max(inv.total - inv.paid, 0);
  const qr =
    inv.status === "issued" && balance > 0 && dorm.promptpay_id
      ? await promptPayQrDataUrl(dorm.promptpay_id, balance)
      : null;

  return (
    <Shell>
      <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <div className="font-semibold">{dorm.name}</div>
            <div className="text-sm text-stone-500">
              ใบแจ้งหนี้ {inv.invoice_no} · ห้อง {inv.room_no} · {fmtPeriod(inv.period)}
            </div>
          </div>
          <StatusBadge status={status} />
        </div>
        <table className="w-full text-sm">
          <tbody>
            {items.map((it, idx) => (
              <tr key={idx} className="border-t border-cream-dark">
                <td className="py-1.5">
                  {it.description}
                  {it.quantity != null && it.unit_price != null && (
                    <span className="text-xs text-stone-400"> ({it.quantity} × {fmtMoney(it.unit_price)})</span>
                  )}
                </td>
                <td className="py-1.5 text-right">{fmtMoney(it.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-teak-800 font-bold">
              <td className="py-2">รวมทั้งสิ้น</td>
              <td className="py-2 text-right">{fmtMoney(inv.total)} ฿</td>
            </tr>
          </tbody>
        </table>
        {inv.due_date && balance > 0 && (
          <p className="mt-2 text-xs text-stone-500">กรุณาชำระภายใน {inv.due_date}</p>
        )}
      </div>

      {qr && (
        <div className="rounded-2xl border border-sand bg-white shadow-sm p-5 text-center">
          <h2 className="mb-2 font-semibold">สแกนจ่ายด้วยพร้อมเพย์</h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="PromptPay QR" className="mx-auto w-60" />
          <p className="text-sm text-stone-600">ยอดชำระ {fmtMoney(balance)} บาท</p>
          <p className="mt-1 text-xs text-stone-400">หลังโอนแล้ว แจ้งสลิปให้เจ้าของหอพักยืนยันยอด</p>
        </div>
      )}
      {status === "paid" && (
        <div className="rounded-xl border border-lime-200 bg-lime-50 p-4 text-center text-lime-800">
          ✅ {STATUS_TH.paid} — ขอบคุณครับ
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md space-y-4 p-6">
      <h1 className="font-display text-2xl font-bold text-marigold-700">หอพร้อม</h1>
      {children}
    </div>
  );
}
