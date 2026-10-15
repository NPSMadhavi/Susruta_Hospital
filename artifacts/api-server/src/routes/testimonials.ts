import { Router } from "express";
import { db, testimonialsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../lib/auth";

const router = Router();

router.get("/", async (req, res) => {
  const testimonials = await db
    .select()
    .from(testimonialsTable)
    .where(and(eq(testimonialsTable.isPublished, true), eq(testimonialsTable.deleteColumn, 0)))
    .orderBy(testimonialsTable.createdAt);
  res.json(testimonials.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.post("/", requireAdmin, async (req, res) => {
  const { patientName, patientLocation, content, contentTe, rating, isPublished } = req.body;
  if (!patientName || !content || rating === undefined) {
    res.status(400).json({ error: "missing_fields", message: "patientName, content, and rating are required" });
    return;
  }
  const [testimonial] = await db
    .insert(testimonialsTable)
    .values({
      patientName,
      patientLocation: patientLocation ?? null,
      content,
      contentTe: contentTe ?? null,
      rating: Number(rating),
      isPublished: isPublished ?? true,
      deleteColumn: 0,
    })
    .returning();
  res.status(201).json({ ...testimonial, createdAt: testimonial.createdAt.toISOString() });
});

router.get("/all", requireAdmin, async (req, res) => {
  const testimonials = await db
    .select()
    .from(testimonialsTable)
    .where(eq(testimonialsTable.deleteColumn, 0))
    .orderBy(testimonialsTable.createdAt);
  res.json(testimonials.map((t) => ({ ...t, createdAt: t.createdAt.toISOString() })));
});

router.patch("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  const { patientName, patientLocation, content, contentTe, rating, isPublished } = req.body;
  const updates: Record<string, unknown> = {};
  if (patientName !== undefined) updates.patientName = patientName;
  if (patientLocation !== undefined) updates.patientLocation = patientLocation;
  if (content !== undefined) updates.content = content;
  if (contentTe !== undefined) updates.contentTe = contentTe;
  if (rating !== undefined) updates.rating = Number(rating);
  if (isPublished !== undefined) updates.isPublished = isPublished;

  const [updated] = await db
    .update(testimonialsTable)
    .set(updates)
    .where(and(eq(testimonialsTable.id, id), eq(testimonialsTable.deleteColumn, 0)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "not_found", message: "Testimonial not found" });
    return;
  }
  res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "invalid_id" }); return; }
  await db
    .update(testimonialsTable)
    .set({ deleteColumn: 1 })
    .where(and(eq(testimonialsTable.id, id), eq(testimonialsTable.deleteColumn, 0)));
  res.status(204).send();
});

export default router;
