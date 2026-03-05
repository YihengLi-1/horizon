import path from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  devIndicators: false,
  transpilePackages: ["@sis/shared"],
  // Required for Docker standalone output in a pnpm monorepo
  output: process.env.NEXT_BUILD_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: process.env.NEXT_BUILD_STANDALONE === "1"
    ? path.join(__dirname, "../../")
    : undefined,
};

export default nextConfig;
