import { cache } from "react";
import { sql } from "./db";
import { requireOwner } from "./auth";

export type Dorm = {
  id: number; owner_id: number; name: string; address: string | null;
  promptpay_id: string | null; bank_name: string | null;
  bank_account_no: string | null; bank_account_name: string | null;
  water_rate: number; electric_rate: number; service_fee: number;
  trash_fee: number; wifi_fee: number; due_in_days: number;
};

// cache(): one dorms query per request no matter how many callers.
export const getDormCached = cache(async (): Promise<Dorm> => {
  const owner = await requireOwner();
  return (await sql()<Dorm[]>`SELECT * FROM dorms WHERE owner_id = ${owner.id}`)[0];
});
