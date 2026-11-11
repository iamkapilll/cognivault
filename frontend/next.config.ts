
import type { NextConfig } from "next";

// Server-side proxy target for /backend/*. Next bakes rewrite destinations
// into the build, so the Docker build passes the container hostname; local
// development falls back to the backend on the host machine.
const backendInternalUrl =
  process.env.BACKEND_INTERNAL_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: `${backendInternalUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
