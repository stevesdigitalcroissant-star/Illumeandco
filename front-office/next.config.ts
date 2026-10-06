import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subfolder of a larger repository.
  turbopack: { root: import.meta.dirname },
  serverExternalPackages: ["pg"],
  async headers() {
    return [
      {
        // The widget is embedded on customers' websites inside an iframe.
        source: "/widget/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
      {
        source: "/((?!widget).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
