import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT || "5173";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

function publicDirIndexPlugin() {
  let resolvedPublicDir = "";

  function makeHandler(getPublicDir: () => string) {
    return function (req: any, res: any, next: any) {
      const publicDir = getPublicDir();
      if (!publicDir) return next();

      const rawUrl = req.url || "";
      const url = rawUrl.split("?")[0];

      if (url.includes(".")) return next();

      const normalized = url.endsWith("/") ? url : url + "/";
      const candidate = path.join(publicDir, normalized, "index.html");

      try {
        const content = fs.readFileSync(candidate, "utf-8");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        res.end(content);
      } catch {
        next();
      }
    };
  }

  return {
    name: "public-dir-index",
    configResolved(config: any) {
      resolvedPublicDir = config.publicDir as string;
    },
    configureServer(server: any) {
      server.middlewares.use(makeHandler(() => resolvedPublicDir));
    },
    configurePreviewServer(server: any) {
      server.middlewares.use(makeHandler(() => resolvedPublicDir));
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    publicDirIndexPlugin(),
    react(),
    tailwindcss(),
    // runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.BACKEND_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
