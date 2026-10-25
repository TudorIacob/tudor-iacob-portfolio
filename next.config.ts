import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: { "/*": ["./.env", "./.env.*", "./backend/**"] },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          ...(process.env.NODE_ENV === "production"
            ? [
                // Report-only: evaluate hydration/inline styles before enforcement.
                // Reports stay in browser DevTools; no public ingestion endpoint.
                {
                  key: "Content-Security-Policy-Report-Only",
                  value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
                },
                { key: "Strict-Transport-Security", value: "max-age=86400" },
              ]
            : []),
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
