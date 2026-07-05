"use client";

import { useActionState } from "react";
import { addTenantAction, type ActionResult } from "@/app/actions";

export default function AddTenantForm({ roomId }: { roomId: number }) {
  const [state, formAction, pending] = useActionState(
    (_: ActionResult, form: FormData) => addTenantAction(form),
    undefined
  );

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="room_id" value={roomId} />
        <input
          type="text"
          name="full_name"
          placeholder="ชื่อผู้เช่า"
          required
          className="w-32 rounded-lg border border-sand px-2 py-1.5 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
        />
        <input
          type="text"
          name="phone"
          placeholder="เบอร์โทร"
          className="w-28 rounded-lg border border-sand px-2 py-1.5 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-marigold-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teak-800 disabled:opacity-60"
        >
          {pending ? "..." : "เพิ่มผู้เช่า"}
        </button>
      </form>
      {state?.error && <p className="mt-1 text-sm text-red-600">{state.error}</p>}
    </div>
  );
}
