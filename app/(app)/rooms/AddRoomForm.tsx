"use client";

import { useActionState } from "react";
import { createRoomAction, type ActionResult } from "@/app/actions";

export default function AddRoomForm() {
  const [state, formAction, pending] = useActionState(
    (_: ActionResult, form: FormData) => createRoomAction(form),
    undefined
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">เลขห้อง</label>
        <input
          type="text"
          name="room_no"
          required
          className="w-28 rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">ค่าเช่า</label>
        <input
          type="number"
          name="base_rent"
          step="0.01"
          min="0"
          className="w-28 rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600">ค่าไวไฟ</label>
        <input
          type="number"
          name="wifi_fee"
          step="0.01"
          min="0"
          placeholder="ใช้ค่าเริ่มต้นหอ"
          className="w-36 rounded-lg border border-sand px-3 py-2 text-sm placeholder:text-xs focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-marigold-700 px-4 py-2 text-sm font-medium text-white hover:bg-teak-800 disabled:opacity-60"
      >
        {pending ? "กำลังเพิ่ม..." : "+ เพิ่มห้อง"}
      </button>
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
