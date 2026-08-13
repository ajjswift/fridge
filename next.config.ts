import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — it must not be bundled by webpack/turbopack.
  serverExternalPackages: ["better-sqlite3"],
  // The dev badge sits right on top of the bottom tab bar.
  devIndicators: false,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**.openfoodfacts.org" }],
  },
};

export default nextConfig;
