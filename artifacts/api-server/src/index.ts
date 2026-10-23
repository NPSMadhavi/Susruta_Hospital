import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import express from "express";

const apiServerEnv = path.resolve(import.meta.dirname, "../.env");
const rootEnv = path.resolve(import.meta.dirname, "../../../.env");

if (fs.existsSync(apiServerEnv)) {
  dotenv.config({ path: apiServerEnv });
}

if (fs.existsSync(rootEnv)) {
  dotenv.config({ path: rootEnv });
}

import app from "./app";
import { startVerificationReminderWorker } from "./lib/verification-reminders";
import { ensureWebsiteVisitorsTable } from "./migrations/create_website_visitors";
import { ensureDonationsTable } from "./migrations/ensure_donations_table";
import { ensureAccountDeletionRequestsTable } from "./migrations/ensure_account_deletion_requests";
import { runMigration as runSoftDeleteMigration } from "./migrations/add_soft_delete";

/**
 * ------------------------------------------------------------
 * Production React Frontend
 * ------------------------------------------------------------
 *
 * Plesk application root:
 * /httpdocs
 *
 * Frontend build:
 * /httpdocs/artifacts/susruta-hospital/dist/public
 *
 * React Router handles:
 * /admin
 * /doctor
 * /portal
 * /portal/dashboard
 * etc.
 */
const frontendDistPath = path.resolve(
  process.cwd(),
  "artifacts/susruta-hospital/dist/public",
);

// Serve React static files
app.use(express.static(frontendDistPath));

// React SPA fallback
//
// API routes continue to be handled by Express.
// Frontend routes receive index.html so React Router
// can handle the requested URL.
app.get("/{*splat}", (req, res, next) => {
  // Never send API requests to React
  if (
    req.path.startsWith("/api") ||
    req.path.startsWith("/uploads")
  ) {
    return next();
  }

  return res.sendFile(
    path.join(frontendDistPath, "index.html"),
  );
});

/**
 * ------------------------------------------------------------
 * Server
 * ------------------------------------------------------------
 */

const rawPort = process.env["PORT"] || "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, "0.0.0.0", () => {
  console.log(
    `Server listening on port ${port} (http://127.0.0.1:${port})`,
  );

  console.log(
    `Frontend directory: ${frontendDistPath}`,
  );

  startVerificationReminderWorker();
  ensureWebsiteVisitorsTable().catch((err) => console.error("ensureWebsiteVisitorsTable error:", err));
  ensureDonationsTable().catch((err) => console.error("ensureDonationsTable error:", err));
  ensureAccountDeletionRequestsTable().catch((err) => console.error("ensureAccountDeletionRequestsTable error:", err));
  runSoftDeleteMigration().catch((err) => console.error("runSoftDeleteMigration error:", err));
});
