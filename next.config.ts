import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — too small for real inspection reports / contracts (customer documents).
      bodySizeLimit: "15mb",
    },
  },
};

export default nextConfig;
