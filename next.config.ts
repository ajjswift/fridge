import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — it must not be bundled by webpack/turbopack.
  serverExternalPackages: ["better-sqlite3"],
  // The dev badge sits right on top of the bottom tab bar.
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.openfoodfacts.org" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(), microphone=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
