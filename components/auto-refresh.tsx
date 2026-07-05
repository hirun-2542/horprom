"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

// Stale-while-revalidate: staleTimes (next.config.ts) lets navigation paint the
// cached page instantly; this pulls fresh data in the background — on every page
// change and then every `seconds`. router.refresh() swaps data in place, no skeleton.
// ponytail: "realtime" = polling; websockets when this measurably lags.
export function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const firstLoad = useRef(true);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false; // initial load is already fresh — skip one refresh
    } else {
      router.refresh(); // arrived via cached navigation — revalidate behind the scenes
    }
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [router, pathname, seconds]);
  return null;
}
