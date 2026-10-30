import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: path.resolve(process.cwd()),
  images: {
    remotePatterns: [{ protocol: "https", hostname: "gcc-result-out.onrender.com", pathname: "/static/logo.jpeg" }],
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
      ]
    }];
  }
};

export default nextConfig;
