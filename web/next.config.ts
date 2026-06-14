import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const createNextConfig = (phase: string): NextConfig => {
  const isDevServer = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    // Keep dev and production build artifacts apart so `next build` cannot
    // invalidate the running dev server's CSS/chunk manifest.
    distDir: isDevServer ? ".next-dev" : ".next-build",
    reactStrictMode: true,
  };
};

export default createNextConfig;
