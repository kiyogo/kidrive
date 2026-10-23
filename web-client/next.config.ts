import type { NextConfig } from "next";

const isExport = process.env.NEXT_EXPORT === "true";

const nextConfig: NextConfig = {
  output: isExport ? "export" : undefined,
  images: {
    unoptimized: true,
  },
  ...(isExport
    ? {}
    : {
        async rewrites() {
          return [
            {
              source: "/api/:path*",
              destination: "http://127.0.0.1:9683/api/:path*",
            },
            {
              source: "/s/:path*",
              destination: "http://127.0.0.1:9683/s/:path*",
            },
          ];
        },
      }),
};

export default nextConfig;
