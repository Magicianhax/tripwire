import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@tripwire/core"],
  serverExternalPackages: ["node:sqlite"],
  poweredByHeader: false,
};
export default config;
