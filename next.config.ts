import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Client router cache: navigating shows the previously rendered page instantly
    // (no skeleton, no fetch); AutoRefresh revalidates in the background.
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;
