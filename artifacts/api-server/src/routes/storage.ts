import { Router, type Request, type Response } from "express";
import { Readable } from "stream";
import { z } from "zod/v4";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

const RequestUploadUrlBody = z.object({
  name: z.string(),
  size: z.number(),
  contentType: z.string(),
});

// ── POST /storage/uploads/request-url ────────────────────────
// Patient must be authenticated — enforced at call site via middleware
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error: any) {
    if (error?.message?.includes("App Storage service suspended")) {
      res.status(503).json({ error: "storage_suspended", message: "Storage service is unavailable." });
    } else {
      console.error("Storage upload error:", error);
      res.status(500).json({ error: "upload_failed" });
    }
  }
});

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
// Use router.use() so req.path gives the full sub-path (Express 5 compatible)
router.use("/storage/objects", async (req: Request, res: Response) => {
  try {
    const objectPath = `/objects${req.path}`;
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
