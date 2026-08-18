import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    remotePatterns: process.env.MEDIA_CDN_URL
      ? [{ protocol: "https", hostname: new URL(process.env.MEDIA_CDN_URL).hostname }]
      : []
  }
};

export default nextConfig;
