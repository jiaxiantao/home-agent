import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Docker standalone 需打包 Prisma 引擎与 client
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/.prisma/client/**/*",
      "./node_modules/@prisma/client/**/*",
    ],
  },
  turbopack: {},
};

export default nextConfig;
