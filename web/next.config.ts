import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The /api routes reuse the code in ../api/src (the same code that runs on Vultr).
  experimental: { externalDir: true },
};

export default nextConfig;
