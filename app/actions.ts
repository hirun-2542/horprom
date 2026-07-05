"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import {
  createSession, destroySession, requireOwner, hashPassword, verifyPassword,
} from "@/lib/auth";
import { normalizeRoomNo } from "@/lib/util";
import {
  createReadingAndInvoice, issueInvoice, voidInvoice, recomputeTotal,
} from "@/lib/billing";

export type ActionResult = { error?: string } | undefined;

// ---------- auth ----------

export async function registerAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const name = String(form.get("display_name") ?? "").trim();
  const dormName = String(form.get("dorm_name") ?? "").trim();
  if (!email || password.length < 8 || !name || !dormName)
    return { error: "กรอกข้อมูลให้ครบ (รหัสผ่านอย่างน้อย 8 ตัวอักษร)" };

  const s = sql();
  if ((await s`SELECT 1 FROM owners WHERE email = ${email}`).length)
    return { error: "อีเมลนี้ถูกใช้แล้ว" };

  const ownerId = await s.begin(async (tx) => {
    const owner = (
      await tx<{ id: number }[]>`
        INSERT INTO owners (email, password_hash, display_name)
        VALUES (${email}, ${hashPassword(password)}, ${name}) RETURNING id`
    )[0];
    await tx`INSERT INTO dorms (owner_id, name) VALUES (${owner.id}, ${dormName})`;
    return owner.id;
  });

  await createSession(ownerId as number);
  redirect("/dashboard");
}

export async function loginAction(_: ActionResult, form: FormData): Promise<ActionResult> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const rows = await sql()<{ id: number; password_hash: string }[]>`
    SELECT id, password_hash FROM owners WHERE email = ${email}`;
  if (!rows[0] || !verifyPassword(password, rows[0].password_hash))
    return { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  await createSession(rows[0].id);
  redirect("/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ---------- helpers ----------

export type { Dorm } from "@/lib/dorm";

export async function getDorm() {
  const { getDormCached } = await import("@/lib/dorm");
  return getDormCached();
}

// ---------- settings ----------

export async function updateDormAction(form: FormData) {
  const dorm = await getDorm();
  await sql()`
    UPDATE dorms SET
      name = ${String(form.get("name") ?? dorm.name)},
      address = ${String(form.get("address") ?? "") || null},
      promptpay_id = ${String(form.get("promptpay_id") ?? "").replace(/[-\s]/g, "") || null},
      bank_name = ${String(form.get("bank_name") ?? "") || null},
      bank_account_no = ${String(form.get("bank_account_no") ?? "") || null},
      bank_account_name = ${String(form.get("bank_account_name") ?? "") || null},
      water_rate = ${Number(form.get("water_rate") ?? dorm.water_rate)},
      electric_rate = ${Number(form.get("electric_rate") ?? dorm.electric_rate)},
      service_fee = ${Number(form.get("service_fee") ?? dorm.service_fee)},
      trash_fee = ${Number(form.get("trash_fee") ?? dorm.trash_fee)},
      wifi_fee = ${Number(form.get("wifi_fee") ?? dorm.wifi_fee)},
      due_in_days = ${Number(form.get("due_in_days") ?? dorm.due_in_days)}
    WHERE id = ${dorm.id}`;
  revalidatePath("/settings");
}

// ---------- rooms & tenants ----------

export async function createRoomAction(form: FormData): Promise<ActionResult> {
  const dorm = await getDorm();
  const roomNo = String(form.get("room_no") ?? "").trim();
  if (!roomNo) return { error: "กรอกเลขห้อง" };
  try {
    await sql()`
      INSERT INTO rooms (dorm_id, room_no, room_no_norm, base_rent, wifi_fee)
      VALUES (${dorm.id}, ${roomNo}, ${normalizeRoomNo(roomNo)},
        ${Number(form.get("base_rent") ?? 0)},
        ${form.get("wifi_fee") ? Number(form.get("wifi_fee")) : null})`;
  } catch {
    return { error: `มีห้อง ${roomNo} อยู่แล้ว` };
  }
  revalidatePath("/rooms");
}

export async function updateRoomAction(form: FormData) {
  const dorm = await getDorm();
  await sql()`
    UPDATE rooms SET base_rent = ${Number(form.get("base_rent") ?? 0)},
      wifi_fee = ${form.get("wifi_fee") ? Number(form.get("wifi_fee")) : null}
    WHERE id = ${Number(form.get("room_id"))} AND dorm_id = ${dorm.id}`;
  revalidatePath("/rooms");
}

export async function addTenantAction(form: FormData): Promise<ActionResult> {
  const dorm = await getDorm();
  const roomId = Number(form.get("room_id"));
  const name = String(form.get("full_name") ?? "").trim();
  if (!name) return { error: "กรอกชื่อผู้เช่า" };
  const room = await sql()`SELECT id FROM rooms WHERE id = ${roomId} AND dorm_id = ${dorm.id}`;
  if (!room.length) return { error: "ไม่พบห้อง" };
  try {
    await sql()`
      INSERT INTO tenants (room_id, full_name, phone, moved_in_at)
      VALUES (${roomId}, ${name}, ${String(form.get("phone") ?? "") || null}, CURRENT_DATE)`;
  } catch {
    return { error: "ห้องนี้มีผู้เช่าอยู่แล้ว — ย้ายออกก่อน" };
  }
  revalidatePath("/rooms");
}

// Bind a tenant to a LINE account captured by the webhook (line_contacts),
// then confirm to that user over LINE. Same clear-then-set as chat registration.
export async function linkTenantLineAction(form: FormData): Promise<void> {
  const dorm = await getDorm();
  const tenantId = Number(form.get("tenant_id"));
  const lineUserId = String(form.get("line_user_id") ?? "");
  // ponytail: void return for plain <form action> — bad input can't come from the UI (select is required).
  if (!lineUserId.startsWith("U")) return;
  const t = (
    await sql()<{ id: number; full_name: string; room_no: string }[]>`
      SELECT t.id, t.full_name, r.room_no FROM tenants t JOIN rooms r ON t.room_id = r.id
      WHERE t.id = ${tenantId} AND t.is_active = 1 AND r.dorm_id = ${dorm.id}`
  )[0];
  if (!t) return;
  await sql().begin((tx) => [
    tx`UPDATE tenants SET line_user_id = NULL WHERE line_user_id = ${lineUserId}`,
    tx`UPDATE tenants SET line_user_id = ${lineUserId} WHERE id = ${t.id}`,
  ]);
  const { pushMessages } = await import("@/lib/line");
  await pushMessages(lineUserId, [
    {
      type: "text",
      text:
        `ผูกบัญชี LINE กับห้อง ${t.room_no} (${t.full_name}) เรียบร้อยค่ะ\n\n` +
        "หลังจากนี้ระบบจะส่งใบแจ้งหนี้มาที่ LINE นี้ค่ะ\nพิมพ์ \"บิล\" เพื่อดูใบแจ้งหนี้ล่าสุด",
    },
  ]).catch((e) => console.error("[line] link confirm push:", e));
  revalidatePath("/rooms");
}

export async function moveOutTenantAction(form: FormData) {
  const dorm = await getDorm();
  await sql()`
    UPDATE tenants SET is_active = 0, moved_out_at = CURRENT_DATE
    WHERE id = ${Number(form.get("tenant_id"))}
      AND room_id IN (SELECT id FROM rooms WHERE dorm_id = ${dorm.id})`;
  revalidatePath("/rooms");
}

// ---------- meter readings → invoices ----------

export async function submitReadingAction(form: FormData): Promise<ActionResult> {
  const dorm = await getDorm();
  const roomId = Number(form.get("room_id"));
  const period = String(form.get("period") ?? "");
  const room = (
    await sql()<{ id: number; dorm_id: number; room_no: string; base_rent: number; wifi_fee: number | null }[]>`
      SELECT * FROM rooms WHERE id = ${roomId} AND dorm_id = ${dorm.id}`
  )[0];
  if (!room || !/^\d{4}-\d{2}$/.test(period)) return { error: "ข้อมูลไม่ถูกต้อง" };

  const meterReset = form.get("meter_reset") === "on";
  try {
    await createReadingAndInvoice({
      dorm, room, period,
      waterCurrent: Number(form.get("water_current") ?? 0),
      electricCurrent: Number(form.get("electric_current") ?? 0),
      meterReset,
      waterUsageOverride: meterReset ? Number(form.get("water_usage") ?? 0) : undefined,
      electricUsageOverride: meterReset ? Number(form.get("electric_usage") ?? 0) : undefined,
      note: String(form.get("note") ?? "") || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "เกิดข้อผิดพลาด";
    if (msg.includes("ux_invoice_active") || msg.includes("duplicate key"))
      return { error: "ห้องนี้มีบิลของเดือนนี้อยู่แล้ว — ยกเลิกบิลเดิมก่อนถ้าต้องการออกใหม่" };
    return { error: msg };
  }
  revalidatePath("/readings");
  revalidatePath("/invoices");
}

// ---------- invoice lifecycle ----------

export async function issueInvoiceAction(form: FormData) {
  const dorm = await getDorm();
  const id = Number(form.get("invoice_id"));
  const inv = await sql()`SELECT id FROM invoices WHERE id = ${id} AND dorm_id = ${dorm.id}`;
  if (inv.length) {
    await issueInvoice(id, dorm.due_in_days);
    await notifyTenantLine(id);
  }
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

async function notifyTenantLine(invoiceId: number) {
  const inv = (
    await sql()<
      { invoice_no: string; period: string; room_no: string; tenant_name: string | null; total: number; due_date: string | null; line_user_id: string | null }[]
    >`
      SELECT i.invoice_no, i.period, i.room_no, i.tenant_name, i.total, i.due_date, t.line_user_id
      FROM invoices i LEFT JOIN tenants t ON i.tenant_id = t.id WHERE i.id = ${invoiceId}`
  )[0];
  if (!inv?.line_user_id) return;
  const items = await sql()<{ description: string; amount: number }[]>`
    SELECT description, amount FROM invoice_items WHERE invoice_id = ${invoiceId} ORDER BY id`;
  const { pushInvoiceNotice } = await import("@/lib/line");
  const { signPayload, fmtPeriod } = await import("@/lib/util");
  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  await pushInvoiceNotice({
    lineUserId: inv.line_user_id,
    invoiceNo: inv.invoice_no,
    periodLabel: fmtPeriod(inv.period),
    roomNo: inv.room_no,
    tenantName: inv.tenant_name,
    total: inv.total,
    dueDate: inv.due_date,
    items,
    invoiceUrl: `${base}/t/invoice?token=${encodeURIComponent(signPayload(`invoice|${invoiceId}`, 90))}`,
  }).catch((e) => console.error("LINE push failed:", e));
}

// Batch issue+send — replaces the GAS spreadsheet menu (BatchSend.gs).
export async function issueAllDraftsAction(form: FormData) {
  const dorm = await getDorm();
  const period = String(form.get("period") ?? "");
  if (!/^\d{4}-\d{2}$/.test(period)) return;
  const drafts = await sql()<{ id: number }[]>`
    SELECT id FROM invoices WHERE dorm_id = ${dorm.id} AND status = 'draft' AND period = ${period}
    ORDER BY room_no`;
  for (const d of drafts) {
    await issueInvoice(d.id, dorm.due_in_days);
    await notifyTenantLine(d.id);
  }
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

export async function voidInvoiceAction(form: FormData) {
  const dorm = await getDorm();
  const id = Number(form.get("invoice_id"));
  const inv = await sql()`SELECT id FROM invoices WHERE id = ${id} AND dorm_id = ${dorm.id}`;
  if (inv.length) await voidInvoice(id);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

export async function addInvoiceItemAction(form: FormData): Promise<ActionResult> {
  const dorm = await getDorm();
  const id = Number(form.get("invoice_id"));
  const desc = String(form.get("description") ?? "").trim();
  const amount = Number(form.get("amount"));
  if (!desc || !Number.isFinite(amount)) return { error: "กรอกรายการและจำนวนเงิน" };
  const inv = (
    await sql()<{ status: string }[]>`SELECT status FROM invoices WHERE id = ${id} AND dorm_id = ${dorm.id}`
  )[0];
  if (!inv || inv.status !== "draft") return { error: "เพิ่มรายการได้เฉพาะบิลร่าง" };
  await sql()`INSERT INTO invoice_items (invoice_id, kind, description, amount) VALUES (${id}, 'other', ${desc}, ${amount})`;
  await recomputeTotal(id);
  revalidatePath(`/invoices/${id}`);
}

export async function addPaymentAction(form: FormData): Promise<ActionResult> {
  const dorm = await getDorm();
  const id = Number(form.get("invoice_id"));
  const amount = Number(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "จำนวนเงินไม่ถูกต้อง" };
  const inv = (
    await sql()<{ status: string }[]>`SELECT status FROM invoices WHERE id = ${id} AND dorm_id = ${dorm.id}`
  )[0];
  if (!inv || inv.status !== "issued") return { error: "บันทึกรับเงินได้เฉพาะบิลที่ออกแล้ว" };
  await sql()`
    INSERT INTO payments (invoice_id, amount, method, paid_at, note)
    VALUES (${id}, ${amount}, ${String(form.get("method") ?? "cash")},
      ${String(form.get("paid_at") ?? "") || new Date().toISOString()},
      ${String(form.get("note") ?? "") || null})`;
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
  revalidatePath("/dashboard");
}

// ---------- complaints ----------

export async function updateComplaintStatusAction(form: FormData) {
  const dorm = await getDorm();
  const id = Number(form.get("complaint_id"));
  const status = String(form.get("status"));
  if (!["new", "in_progress", "resolved"].includes(status)) return;
  await sql()`
    UPDATE complaints SET status = ${status},
      resolved_at = CASE WHEN ${status} = 'resolved' THEN now() ELSE NULL END
    WHERE id = ${id} AND dorm_id = ${dorm.id}`;
  revalidatePath("/complaints");
}
