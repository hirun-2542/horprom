"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/app/actions";

export default function RegisterPage() {
  const [state, formAction, pending] = useActionState(registerAction, undefined);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="font-display text-3xl font-bold text-marigold-700">หอพร้อม</div>
          <div className="mt-1 text-sm text-stone-500">ระบบจัดการหอพัก</div>
        </div>
        <div className="rounded-2xl border border-sand bg-white shadow-sm p-5">
          <form action={formAction} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-teak-800">ชื่อเจ้าของ</label>
              <input
                type="text"
                name="display_name"
                required
                className="w-full rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-teak-800">ชื่อหอพัก</label>
              <input
                type="text"
                name="dorm_name"
                required
                className="w-full rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-teak-800">อีเมล</label>
              <input
                type="email"
                name="email"
                required
                className="w-full rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-teak-800">รหัสผ่าน</label>
              <input
                type="password"
                name="password"
                required
                minLength={8}
                className="w-full rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
              />
              <p className="mt-1 text-xs text-stone-400">อย่างน้อย 8 ตัวอักษร</p>
            </div>
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-marigold-700 px-3 py-2 text-sm font-medium text-white hover:bg-teak-800 disabled:opacity-60"
            >
              {pending ? "กำลังลงทะเบียน..." : "ลงทะเบียน"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-stone-500">
          มีบัญชีอยู่แล้ว?{" "}
          <Link href="/login" className="font-medium text-marigold-700 hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
