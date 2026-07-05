"use client";

import { useActionState } from "react";
import { addInvoiceItemAction, addPaymentAction, type ActionResult } from "@/app/actions";

export function AddItemForm({ invoiceId }: { invoiceId: number }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    (_prev, form) => addInvoiceItemAction(form),
    undefined
  );
  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-2 border-t border-cream-dark pt-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <label className="text-xs text-stone-600">
        รายการเพิ่มเติม
        <input name="description" required placeholder="เช่น ค่าปรับ, ส่วนลด (ใส่ลบ)" className="mt-1 block w-52 rounded-lg border border-sand px-2.5 py-1.5 text-sm" />
      </label>
      <label className="text-xs text-stone-600">
        จำนวนเงิน
        <input name="amount" type="number" step="0.01" required className="mt-1 block w-28 rounded-lg border border-sand px-2.5 py-1.5 text-sm" />
      </label>
      <button disabled={pending} className="rounded-lg border border-sand bg-white px-3 py-1.5 text-sm hover:bg-cream-dark disabled:opacity-50">
        เพิ่ม
      </button>
      {state?.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
    </form>
  );
}

export function AddPaymentForm({ invoiceId, defaultAmount }: { invoiceId: number; defaultAmount: number }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    (_prev, form) => addPaymentAction(form),
    undefined
  );
  return (
    <form action={formAction} className="space-y-2 text-sm">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-stone-600">
          จำนวนเงิน
          <input name="amount" type="number" step="0.01" min="0.01" defaultValue={defaultAmount} required className="mt-1 block w-full rounded-lg border border-sand px-2.5 py-1.5 text-sm" />
        </label>
        <label className="text-xs text-stone-600">
          ช่องทาง
          <select name="method" className="mt-1 block rounded-lg border border-sand px-2.5 py-1.5 text-sm">
            <option value="promptpay">พร้อมเพย์</option>
            <option value="transfer">โอนเงิน</option>
            <option value="cash">เงินสด</option>
          </select>
        </label>
      </div>
      <label className="block text-xs text-stone-600">
        บันทึกช่วยจำ
        <input name="note" className="mt-1 block w-full rounded-lg border border-sand px-2.5 py-1.5 text-sm" />
      </label>
      <button disabled={pending} className="w-full rounded-lg bg-lime-700 px-4 py-2 font-medium text-white hover:bg-lime-800 disabled:opacity-50">
        {pending ? "กำลังบันทึก…" : "บันทึกรับเงิน"}
      </button>
      {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
