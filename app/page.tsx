import { redirect } from "next/navigation";
import { getOwner } from "@/lib/auth";

export default async function Home() {
  redirect((await getOwner()) ? "/dashboard" : "/login");
}
