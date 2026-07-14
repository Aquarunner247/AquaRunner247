import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB — too small for real inspection reports / contracts (customer documents).
      bodySizeLimit: "15mb",
    },
    // Default is exactly 10MB, which collides with the visit-photo upload route's own 10MB
    // check (app/api/visits/[id]/photos/route.ts) — Next truncates the body and FormData
    // parsing throws before our code ever sees file.size, producing a raw 500 instead of a
    // clean 400. Raised above that check so our own validation is the one that actually fires.
    middlewareClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
