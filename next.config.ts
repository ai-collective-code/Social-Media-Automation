import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emits `.next/standalone` — a self-contained server with only the
   * node_modules it actually uses. That is what the desktop build ships;
   * copying the whole project into the installer would be several hundred
   * megabytes of build tooling nobody runs at runtime.
   */
  output: "standalone",

  images: {
    /**
     * Generated media is already produced at its display size, and in the
     * packaged app it is served by a route handler out of the user's profile
     * rather than from `public/`. Running it back through the optimizer would
     * add a sharp dependency and a self-HTTP round trip to resize images that
     * are already the right size.
     */
    unoptimized: true,
  },

  experimental: {
    serverActions: {
      /**
       * Scene clips are uploaded through a Server Action, and the default cap
       * is 1MB — far below a real 8-second 1080x1920 clip out of Flow/Veo,
       * which lands around 5-15MB. The ceiling is deliberately generous rather
       * than exact; the upload action does its own size check with a clear
       * message, which is a much better failure than Next rejecting the
       * request body before any of our code runs.
       */
      bodySizeLimit: "64mb",
    },
  },
};

export default nextConfig;
