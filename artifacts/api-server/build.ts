import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");

  // Clean previous build
  await rm(distDir, {
    recursive: true,
    force: true,
  });

  console.log("building server...");

  // Read api-server package.json
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));

  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  /*
   * Workspace packages must be bundled because they currently
   * resolve to workspace source files.
   *
   * Third-party npm packages should remain external so Node.js
   * loads their original ESM/CommonJS implementations from
   * node_modules.
   */
  const externals = allDeps.filter(
    (dep) =>
      !dep.startsWith("@workspace/") &&
      !pkg.dependencies?.[dep]?.startsWith("workspace:"),
  );

  /*
   * Explicitly keep Node/CommonJS runtime packages external.
   *
   * This prevents esbuild from embedding CommonJS code that uses
   * dynamic require() inside the ESM production bundle.
   */
  const nodeRuntimeExternals = [
    "dotenv",

    // PostgreSQL
    "pg",
    "pg-pool",
    "pg-protocol",
    "pg-types",
    "pg-int8",
    "postgres-array",
    "postgres-bytea",
    "postgres-date",
    "postgres-interval",
    "postgres-range",

    // Common Node runtime dependencies
    "debug",
    "ms",
    "supports-color",
  ];

  for (const dep of nodeRuntimeExternals) {
    if (!externals.includes(dep)) {
      externals.push(dep);
    }
  }

  console.log("External dependencies:");
  console.log(externals.join(", "));

  await esbuild({
    // Backend entry point
    entryPoints: [path.resolve(__dirname, "src/index.ts")],

    // Node.js application
    platform: "node",

    // Bundle application/workspace source
    bundle: true,

    // Keep ESM because package.json uses:
    // "type": "module"
    format: "esm",

    // Production output
    outfile: path.resolve(distDir, "index.js"),

    // Production environment
    define: {
      "process.env.NODE_ENV": '"production"',
    },

    // Minify production bundle
    minify: true,

    /*
     * Keep third-party dependencies external.
     *
     * This allows Node.js 24 to load packages such as pg,
     * express, passport, multer, etc. directly from node_modules.
     */
    external: externals,

    logLevel: "info",
  });

  console.log("Server build completed successfully.");
  console.log(`Output: ${path.resolve(distDir, "index.js")}`);
}

buildAll().catch((err) => {
  console.error("Server build failed:");
  console.error(err);
  process.exit(1);
});