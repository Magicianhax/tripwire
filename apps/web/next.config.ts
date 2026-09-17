import type { NextConfig } from "next";

/** Every page and API response: never frameable (the /rules editor must not be clickjacked into
 * weakening protection), no referrer leaks, no MIME sniffing. */
export const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const config: NextConfig = {
  transpilePackages: ["@tripwire/core"],
  serverExternalPackages: ["node:sqlite"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};
export default config;
