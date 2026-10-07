import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import router from "./routes";

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ------------------------------------------------------------
// API ROUTES
// ------------------------------------------------------------

app.use("/api", router);

// ------------------------------------------------------------
// PRODUCTION FRONTEND
// ------------------------------------------------------------
//
// Frontend build:
// artifacts/susruta-hospital/dist/public
//
// In Plesk:
// /httpdocs/artifacts/susruta-hospital/dist/public
//
// React Router handles routes such as:
// /admin
// /doctor
// /portal
// /portal/dashboard
// etc.
// ------------------------------------------------------------

const frontendDistPath = path.resolve(
  process.cwd(),
  "artifacts/susruta-hospital/dist/public",
);

// Serve frontend static files
app.use(express.static(frontendDistPath));

// ------------------------------------------------------------
// DEVELOPMENT REDIRECT
// ------------------------------------------------------------
//
// When running the backend locally on port 5000 in development,
// redirect frontend routes to Vite on port 5173.
//
// In production, this redirect is NOT used.
// ------------------------------------------------------------

app.use(
  (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (
      process.env.NODE_ENV !== "production" &&
      !req.path.startsWith("/api")
    ) {
      const host = req.get("host") || "";

      if (host.includes(":5000")) {
        return res.redirect(
          `http://localhost:5173${req.originalUrl}`,
        );
      }
    }

    next();
  },
);

// ------------------------------------------------------------
// REACT SPA FALLBACK
// ------------------------------------------------------------
//
// Direct browser requests such as:
//
// /admin
// /doctor
// /portal
// /portal/dashboard
//
// must return index.html so React Router can handle them.
//
// API routes are excluded.
// ------------------------------------------------------------

app.get("/{*splat}", (req, res, next) => {
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

// ------------------------------------------------------------
// GLOBAL ERROR HANDLER
// ------------------------------------------------------------

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("❌ API Error:", err.message || err);

    if (
      err?.code === "28P01" ||
      err?.message?.includes("password authentication failed")
    ) {
      res.status(500).json({
        error: "database_auth_failed",
        message:
          "Database authentication failed. Please update your PostgreSQL password in .env file.",
      });
      return;
    }

    if (
      err?.code === "ECONNREFUSED" ||
      err?.message?.includes("connect ECONNREFUSED")
    ) {
      res.status(500).json({
        error: "database_offline",
        message:
          "Could not connect to PostgreSQL server on localhost:5432. Please make sure PostgreSQL service is running.",
      });
      return;
    }

    res.status(500).json({
      error: "internal_server_error",
      message:
        err.message || "An unexpected error occurred.",
    });
  },
);

export default app;