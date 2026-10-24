import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

const nextConfig: NextConfig = {
  output: isDev ? undefined : "export",
  images: {
    unoptimized: true,
  },
  ...(isDev
    ? {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:5437/api/:path*",
            },
            {
              source: "/s/:path*",
              destination: "http://127.0.0.1:5437/s/:path*",
            },
          ];
        },
      }
    : {}),
};

export default nextConfig;
