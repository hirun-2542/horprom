"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, undefined);

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
                className="w-full rounded-lg border border-sand px-3 py-2 text-sm focus:border-marigold-500 focus:outline-none focus:ring-1 focus:ring-marigold-500"
              />
            </div>
            {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-marigold-700 px-3 py-2 text-sm font-medium text-white hover:bg-teak-800 disabled:opacity-60"
            >
              {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-sm text-stone-500">
          ยังไม่มีบัญชี?{" "}
          <Link href="/register" className="font-medium text-marigold-700 hover:underline">
            ลงทะเบียน
          </Link>
        </p>
      </div>
    </div>
  );
}
