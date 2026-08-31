import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import router from "./routes";

const app: Express = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use("/api", router);

// Redirect non-API routes requested on backend port 5000 to frontend Vite server (port 5173)
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.path.startsWith("/api")) {
    const host = req.get("host") || "";
    if (host.includes(":5000")) {
      return res.redirect(`http://localhost:5173${req.originalUrl}`);
    }
  }
  next();
});

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("❌ API Error:", err.message || err);
  if (err?.code === "28P01" || err?.message?.includes("password authentication failed")) {
    res.status(500).json({
      error: "database_auth_failed",
      message: "Database authentication failed. Please update your PostgreSQL password in .env file.",
    });
    return;
  }
  if (err?.code === "ECONNREFUSED" || err?.message?.includes("connect ECONNREFUSED")) {
    res.status(500).json({
      error: "database_offline",
      message: "Could not connect to PostgreSQL server on localhost:5432. Please make sure PostgreSQL service is running.",
    });
    return;
  }
  res.status(500).json({
    error: "internal_server_error",
    message: err.message || "An unexpected error occurred.",
  });
});

export default app;
