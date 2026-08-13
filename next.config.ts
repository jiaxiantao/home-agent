import path from "node:path";
import type { NextConfig } from "next";

const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: projectRoot,
  serverExternalPackages: ["redis", "@redis/client", "mysql2"],
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
