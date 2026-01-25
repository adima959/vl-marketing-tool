import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker production builds
  output: 'standalone',

  // Optimize for production
  compress: true,

  // Enable production source maps (optional - remove if not needed)
  productionBrowserSourceMaps: false,
};

export default nextConfig;
