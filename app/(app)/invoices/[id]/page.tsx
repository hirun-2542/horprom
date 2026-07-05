import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { getDorm, issueInvoiceAction, voidInvoiceAction } from "@/app/actions";
import { getInvoice, deriveStatus } from "@/lib/billing";
import { fmtMoney, fmtPeriod, signPayload } from "@/lib/util";
import { promptPayQrDataUrl } from "@/lib/qr";
import { StatusBadge } from "@/components/status-badge";
import { AddItemForm, AddPaymentForm } from "./forms";

export const dynamic = "force-dynamic";

const METHOD_TH: Record<string, string> = {
  promptpay: "พร้อมเพย์",
  transfer: "โอนเงิน",
  cash: "เงินสด",
};

export default async function InvoiceDetail({ params }: { params: Promise<{ id: string }> }) {
  const dorm = await getDorm();
  const { id } = await params;
  const inv = await getInvoice(Number(id), dorm.id);
  if (!inv) notFound();

  const [items, payments] = await Promise.all([
    sql()<{ id: number; description: string; quantity: number | null; unit_price: number | null; amount: number }[]>`
      SELECT * FROM invoice_items WHERE invoice_id = ${inv.id} ORDER BY id`,
    sql()<{ id: number; amount: number; method: string; paid_at: string; note: string | null }[]>`
      SELECT * FROM payments WHERE invoice_id = ${inv.id} ORDER BY paid_at`,
  ]);

  const status = deriveStatus(inv);
  const balance = Math.max(inv.total - inv.paid, 0);
  const qr =
    inv.status === "issued" && balance > 0 && dorm.promptpay_id
      ? await promptPayQrDataUrl(dorm.promptpay_id, balance)
      : null;
  const tenantLink = `/t/invoice?token=${encodeURIComponent(signPayload(`invoice|${inv.id}`, 90))}`;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/invoices" className="text-sm text-stone-500 hover:underline">← ใบแจ้งหนี้</Link>
          <h1 className="text-2xl font-bold">{inv.invoice_no}</h1>
          <p className="text-sm text-stone-500">
            ห้อง {inv.room_no} · {inv.tenant_name ?? "ไม่ระบุผู้เช่า"} · {fmtPeriod(inv.period)}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-stone-500">
            <tr>
              <th className="pb-2">รายการ</th>
              <th className="pb-2 text-right">หน่วย</th>
              <th className="pb-2 text-right">ราคา/หน่วย</th>
              <th className="pb-2 text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-cream-dark">
                <td className="py-2">{it.description}</td>
                <td className="py-2 text-right text-stone-600">{it.quantity ?? "—"}</td>
                <td className="py-2 text-right text-stone-600">{it.unit_price != null ? fmtMoney(it.unit_price) : "—"}</td>
                <td className="py-2 text-right">{fmtMoney(it.amount)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-teak-800 font-bold">
              <td className="py-2" colSpan={3}>รวมทั้งสิ้น</td>
              <td className="py-2 text-right">{fmtMoney(inv.total)} ฿</td>
            </tr>
            {inv.paid > 0 && (
              <tr className="text-sm text-lime-700">
                <td colSpan={3}>ชำระแล้ว</td>
                <td className="text-right">-{fmtMoney(inv.paid)} ฿</td>
              </tr>
            )}
            {inv.paid > 0 && balance > 0 && (
              <tr className="font-semibold text-red-600">
                <td colSpan={3}>คงเหลือ</td>
                <td className="text-right">{fmtMoney(balance)} ฿</td>
              </tr>
            )}
          </tbody>
        </table>
        {inv.due_date && <p className="mt-3 text-xs text-stone-500">กำหนดชำระภายใน {inv.due_date}</p>}
        {inv.status === "draft" && <AddItemForm invoiceId={inv.id} />}
      </section>

      <div className="flex flex-wrap gap-3">
        {inv.status === "draft" && (
          <>
            <form action={issueInvoiceAction}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <button className="rounded-lg bg-marigold-700 px-5 py-2 text-sm font-medium text-white hover:bg-teak-800">
                ออกใบแจ้งหนี้
              </button>
            </form>
            <form action={voidInvoiceAction}>
              <input type="hidden" name="invoice_id" value={inv.id} />
              <button className="rounded-lg border border-red-300 px-5 py-2 text-sm text-red-600 hover:bg-red-50">
                ยกเลิกร่าง
              </button>
            </form>
          </>
        )}
        {inv.status === "issued" && (
          <form action={voidInvoiceAction}>
            <input type="hidden" name="invoice_id" value={inv.id} />
            <button className="rounded-lg border border-red-300 px-5 py-2 text-sm text-red-600 hover:bg-red-50">
              ยกเลิกบิล (เพื่อออกใหม่)
            </button>
          </form>
        )}
        {inv.status === "issued" && (
          <a
            href={tenantLink}
            target="_blank"
            className="rounded-lg border border-sand bg-white px-5 py-2 text-sm hover:bg-cream-dark"
          >
            🔗 ลิงก์สำหรับผู้เช่า
          </a>
        )}
      </div>

      {inv.status === "issued" && (
        <div className="grid gap-6 sm:grid-cols-2">
          <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
            <h2 className="mb-3 font-semibold">ชำระผ่าน QR พร้อมเพย์</h2>
            {qr ? (
              <div className="text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="PromptPay QR" className="mx-auto w-56" />
                <p className="text-sm text-stone-600">ยอด {fmtMoney(balance)} บาท</p>
              </div>
            ) : balance <= 0 ? (
              <p className="text-sm text-lime-700">ชำระครบแล้ว ✅</p>
            ) : (
              <p className="text-sm text-stone-500">
                ตั้งค่าพร้อมเพย์ที่หน้า <Link href="/settings" className="text-marigold-700 hover:underline">ตั้งค่า</Link> เพื่อแสดง QR
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-sand bg-white shadow-sm p-5">
            <h2 className="mb-3 font-semibold">บันทึกรับเงิน</h2>
            {payments.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {payments.map((p) => (
                  <li key={p.id} className="flex justify-between border-b border-cream-dark pb-1">
                    <span className="text-stone-600">
                      {p.paid_at.slice(0, 10)} · {METHOD_TH[p.method] ?? p.method}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                    <span className="font-medium text-lime-700">+{fmtMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
            {balance > 0 ? (
              <AddPaymentForm invoiceId={inv.id} defaultAmount={balance} />
            ) : (
              <p className="text-sm text-lime-700">ชำระครบแล้ว</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
