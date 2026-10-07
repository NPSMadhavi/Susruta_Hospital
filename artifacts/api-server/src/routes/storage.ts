import express, { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { z } from "zod/v4";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

// Local uploads directory for local development fallback
const UPLOADS_DIR_1 = path.resolve(process.cwd(), "uploads");
const UPLOADS_DIR_2 = path.resolve(import.meta.dirname, "../../uploads");
const UPLOADS_DIRS = [UPLOADS_DIR_1, UPLOADS_DIR_2];

for (const dir of UPLOADS_DIRS) {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  }
}

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

// ── POST /storage/uploads/request-url ────────────────────────
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  const { name, size, contentType } = parsed.data;

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (_error) {
    // Fallback to local disk storage for local development
    const id = randomUUID();
    const uploadURL = `/api/storage/local-upload/${id}`;
    const objectPath = `/objects/local-${id}`;

    const metaJson = JSON.stringify({ name, size, contentType });
    for (const dir of UPLOADS_DIRS) {
      try {
        fs.writeFileSync(path.join(dir, `${id}.json`), metaJson, "utf-8");
      } catch {}
    }

    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  }
});

// ── PUT /storage/local-upload/:id — Handle local file upload ───
router.put(
  "/storage/local-upload/:id",
  express.raw({ type: "*/*", limit: "50mb" }),
  (req: Request, res: Response) => {
    const id = String(req.params.id);
    const data = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || []);

    try {
      for (const dir of UPLOADS_DIRS) {
        try {
          fs.writeFileSync(path.join(dir, id), data);
        } catch {}
      }
      res.json({ success: true });
    } catch (err: any) {
      console.error("Local file write error:", err);
      res.status(500).json({ error: "file_write_failed" });
    }
  }
);

async function streamGcsFile(file: any, res: Response, cacheControl: string) {
  const response = await objectStorageService.downloadObject(file);
  const contentType = response.headers.get("content-type") || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  if (!response.body) { res.status(404).end(); return; }
  const reader = response.body.getReader();
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) { this.push(null); } else { this.push(Buffer.from(value)); }
    },
  });
  nodeStream.pipe(res);
}

// ── GET /storage/objects/... — Serve uploaded files ──────────
router.use("/storage/objects", async (req: Request, res: Response) => {
  const reqPath = req.path;

  // Serve local uploads fallback
  if (reqPath.startsWith("/local-") || !reqPath.includes("gcs-")) {
    const rawId = reqPath.replace(/^\/(objects\/|local-)?/, "").replace(/^\//, "");
    const id = rawId.replace(/^local-/, "");

    let filePath: string | null = null;
    let metaPath: string | null = null;

    for (const dir of UPLOADS_DIRS) {
      const possiblePaths = [
        path.join(dir, id),
        path.join(dir, `local-${id}`),
        path.join(dir, rawId),
      ];
      for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
          filePath = p;
          break;
        }
      }
      if (fs.existsSync(path.join(dir, `${id}.json`))) {
        metaPath = path.join(dir, `${id}.json`);
      }
      if (filePath) break;
    }

    if (!filePath) {
      res.status(404).json({ error: "file_not_found", message: "Document file not found on server disk." });
      return;
    }

    let contentType = "application/octet-stream";
    let fileName = "document";
    if (metaPath && fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (meta.contentType) contentType = meta.contentType;
        if (meta.name) fileName = meta.name;
      } catch {}
    } else {
      if (filePath.endsWith(".png")) contentType = "image/png";
      else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
      else if (filePath.endsWith(".pdf")) contentType = "application/pdf";
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(fileName)}"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  try {
    const objectPath = `/objects${reqPath}`;
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    await streamGcsFile(file, res, "private, max-age=3600");
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "not_found" });
    } else {
      res.status(500).json({ error: "serve_failed" });
    }
  }
});

// ── GET /storage/public-objects/... — Public assets ──────────
router.use("/storage/public-objects", async (req: Request, res: Response) => {
  try {
    const file = await objectStorageService.searchPublicObject(req.path.slice(1));
    if (!file) { res.status(404).end(); return; }
    await streamGcsFile(file, res, "public, max-age=3600");
  } catch {
    res.status(404).end();
  }
});

export default router;
