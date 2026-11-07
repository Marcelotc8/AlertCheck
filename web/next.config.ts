import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las rutas /api reutilizan el código de ../api/src (el mismo que corre en Vultr).
  experimental: { externalDir: true },
};

export default nextConfig;
