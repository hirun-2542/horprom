"use client";

import { useActionState, useState } from "react";
import { submitReadingAction, type ActionResult } from "@/app/actions";

export type RoomReadingInfo = {
  id: number;
  room_no: string;
  tenant_name: string | null;
  prev_water: number | null;
  prev_electric: number | null;
};

export function ReadingRow({ room, period }: { room: RoomReadingInfo; period: string }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(
    (_prev, form) => submitReadingAction(form),
    undefined
  );
  const [reset, setReset] = useState(false);

  return (
    <tr className="border-t border-cream-dark align-top">
      <td className="py-3 pr-2">
        <div className="font-medium">ห้อง {room.room_no}</div>
        <div className="text-xs text-stone-500">{room.tenant_name ?? "ไม่มีผู้เช่า"}</div>
      </td>
      <td colSpan={4} className="py-2">
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="room_id" value={room.id} />
          <input type="hidden" name="period" value={period} />
          <Field label={`มิเตอร์น้ำ (ก่อนหน้า ${room.prev_water ?? "—"})`} name="water_current" />
          <Field label={`มิเตอร์ไฟ (ก่อนหน้า ${room.prev_electric ?? "—"})`} name="electric_current" />
          <label className="flex items-center gap-1.5 pb-2 text-xs text-stone-600">
            <input type="checkbox" name="meter_reset" checked={reset} onChange={(e) => setReset(e.target.checked)} />
            มิเตอร์ใหม่/วนรอบ
          </label>
          {reset && (
            <>
              <Field label="หน่วยน้ำที่ใช้ (กรอกเอง)" name="water_usage" />
              <Field label="หน่วยไฟที่ใช้ (กรอกเอง)" name="electric_usage" />
            </>
          )}
          <button
            disabled={pending}
            className="rounded-lg bg-marigold-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-teak-800 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก…" : "บันทึก + ออกบิล"}
          </button>
          {state?.error && <p className="w-full text-xs text-red-600">{state.error}</p>}
        </form>
      </td>
    </tr>
  );
}

function Field({ label, name }: { label: string; name: string }) {
  return (
    <label className="text-xs text-stone-600">
      {label}
      <input
        type="number"
        step="0.01"
        min="0"
        name={name}
        required
        className="mt-1 block w-36 rounded-lg border border-sand px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}
