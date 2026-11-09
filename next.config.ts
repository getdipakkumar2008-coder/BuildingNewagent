import type { NextConfig } from "next";

// Static security headers. A nonce-based CSP is added in M1 (middleware).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Everything is un-frameable except artifact previews, which only our own pages may frame.
      { source: "/((?!api/artifacts).*)", headers: [{ key: "X-Frame-Options", value: "DENY" }] },
      {
        source: "/api/artifacts/:path*",
        headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }],
      },
    ];
  },
};

export default nextConfig;
