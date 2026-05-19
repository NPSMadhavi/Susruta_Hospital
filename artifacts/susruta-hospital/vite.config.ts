import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const publicDir = path.resolve(import.meta.dirname, "public");

function publicDirIndexPlugin() {
  return {
    name: "public-dir-index",
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = (req.url || "").split("?")[0];
        if (!url.includes(".")) {
          const normalized = url.endsWith("/") ? url : url + "/";
          const candidate = path.join(publicDir, normalized, "index.html");
          if (fs.existsSync(candidate)) {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "no-cache");
            res.end(fs.readFileSync(candidate, "utf-8"));
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    publicDirIndexPlugin(),
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
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
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
