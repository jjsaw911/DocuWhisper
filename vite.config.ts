import fs from "fs";
import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const viteLogger = createLogger();
const viteWarn = viteLogger.warn;
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "package.json"), "utf8"),
) as { version?: string };
const appVersion = `v${packageJson.version || "1.0.0"}`;
const appBuildStamp = new Date().toISOString().slice(0, 10).replace(/-/g, ".");

viteLogger.warn = (msg, options) => {
  if (msg.includes("A PostCSS plugin did not pass the `from` option to `postcss.parse`")) {
    return;
  }
  viteWarn(msg, options);
};

export default defineConfig({
  customLogger: viteLogger,
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __APP_BUILD_STAMP__: JSON.stringify(appBuildStamp),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Keep bundle alerts useful while allowing the intentionally lazy-loaded html2pdf chunk.
    chunkSizeWarningLimit: 1100,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
