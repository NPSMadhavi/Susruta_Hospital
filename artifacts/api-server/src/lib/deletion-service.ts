import { db, accountDeletionRequestsTable, type AccountDeletionRequest } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";

export const CANCELLATION_PERIOD_DAYS = 15;
export const CANCELLATION_PERIOD_MS = CANCELLATION_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/**
 * Calculates remaining whole days until the cancellation deadline.
 */
export function calculateDaysRemaining(
  deadline: Date | string | null | undefined,
  now: Date = new Date()
): number {
  if (!deadline) return 0;
  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return 0;

  const msRemaining = deadlineDate.getTime() - now.getTime();
  if (msRemaining <= 0) return 0;
  return Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
}

/**
 * Checks whether the 15-day cancellation period is active.
 */
export function isCancellationPeriodActive(
  status: string,
  deadline: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (status !== "PENDING" || !deadline) return false;
  const deadlineDate = deadline instanceof Date ? deadline : new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return false;
  return deadlineDate.getTime() > now.getTime();
}

/**
 * Synchronizes any PENDING requests whose 15-day deadline has passed into ELIGIBLE_FOR_DELETION.
 */
export async function syncExpiredDeletionRequests(): Promise<void> {
  try {
    const now = new Date();
    await db
      .update(accountDeletionRequestsTable)
      .set({ status: "ELIGIBLE_FOR_DELETION" })
      .where(
        and(
          eq(accountDeletionRequestsTable.status, "PENDING"),
          lte(accountDeletionRequestsTable.cancellationDeadline, now),
          eq(accountDeletionRequestsTable.deleteColumn, 0)
        )
      );
  } catch (err) {
    console.warn("[syncExpiredDeletionRequests] Warning syncing expired deletion requests:", err);
  }
}

/**
 * Formats a deletion request entity for consistent API output.
 */
export function formatDeletionRequest(r: AccountDeletionRequest, now: Date = new Date()) {
  const isExpired =
    r.status === "PENDING" &&
    r.cancellationDeadline &&
    new Date(r.cancellationDeadline).getTime() <= now.getTime();

  const effectiveStatus = isExpired ? "ELIGIBLE_FOR_DELETION" : r.status;
  const cancellationActive = isCancellationPeriodActive(effectiveStatus, r.cancellationDeadline, now);
  const daysRemaining = calculateDaysRemaining(r.cancellationDeadline, now);

  return {
    id: r.id,
    patientId: r.patientId,
    patientCode: r.patientCode,
    patientName: r.patientName,
    email: r.patientEmail,
    status: effectiveStatus,
    reason: r.reason,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
    cancellationDeadline: r.cancellationDeadline
      ? (r.cancellationDeadline instanceof Date ? r.cancellationDeadline.toISOString() : new Date(r.cancellationDeadline).toISOString())
      : null,
    cancelledAt: r.cancelledAt
      ? (r.cancelledAt instanceof Date ? r.cancelledAt.toISOString() : new Date(r.cancelledAt).toISOString())
      : null,
    processedAt: r.processedAt
      ? (r.processedAt instanceof Date ? r.processedAt.toISOString() : new Date(r.processedAt).toISOString())
      : null,
    processedBy: r.processedBy,
    notes: r.notes,
    daysRemaining,
    isCancellationActive: cancellationActive,
  };
}
