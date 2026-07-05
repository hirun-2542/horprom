import { cookies } from "next/headers";
import { cache } from "react";
import { createHmac, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db";

// ponytail: HMAC-signed cookie session, no session table, no auth lib.
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";
const COOKIE = "horprom_session";

function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export async function createSession(ownerId: number) {
  const payload = `${ownerId}.${Date.now()}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export type Owner = { id: number; email: string; display_name: string };

// cache(): layout and page both call this per navigation — one owners query, not two.
export const getOwner = cache(async (): Promise<Owner | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf(".");
  if (i < 0) return null;
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  const expected = sign(payload);
  if (
    sig.length !== expected.length ||
    !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  )
    return null;
  const ownerId = Number(payload.split(".")[0]);
  const rows = await sql()<Owner[]>`SELECT id, email, display_name FROM owners WHERE id = ${ownerId}`;
  return rows[0] ?? null;
});

export async function requireOwner(): Promise<Owner> {
  const owner = await getOwner();
  if (!owner) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return owner!;
}

export const hashPassword = (pw: string) => bcrypt.hashSync(pw, 10);
export const verifyPassword = (pw: string, hash: string) =>
  bcrypt.compareSync(pw, hash);
