import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // typedRoutes off: albums are dynamic (/a/:slug built at runtime), which
  // typed routes cannot statically verify.
  typedRoutes: false,
  images: {
    remotePatterns: process.env.MEDIA_CDN_URL
      ? [{ protocol: "https", hostname: new URL(process.env.MEDIA_CDN_URL).hostname }]
      : []
  }
};

export default nextConfig;
