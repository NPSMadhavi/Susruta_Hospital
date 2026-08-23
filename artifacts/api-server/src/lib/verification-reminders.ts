import { db, loginTokensTable, patientsTable } from "@workspace/db";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendMagicLink } from "./email";

const INITIAL_DELAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_DELAY_MS = 6 * 60 * 60 * 1000;
const CLAIM_TIMEOUT_MS = 30 * 60 * 1000;
const RUN_INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 25;

let workerRunning = false;

/**
 * Sends one scheduled batch of verification reminders.
 *
 * The claim timestamp is persisted so a process restart can recover abandoned
 * work, while the sent timestamp prevents successful sends from repeating.
 */
export async function sendVerificationReminders(now = new Date()): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;

  try {
    const initialCutoff = new Date(now.getTime() - INITIAL_DELAY_MS);
    const reminderCutoff = new Date(now.getTime() - REMINDER_INTERVAL_MS);
    const retryCutoff = new Date(now.getTime() - RETRY_DELAY_MS);
    const claimCutoff = new Date(now.getTime() - CLAIM_TIMEOUT_MS);

    await finalizeStalePendingDispatches(claimCutoff);

    const candidates = await db
      .select({
        id: patientsTable.id,
        name: patientsTable.name,
        email: patientsTable.email,
        lastSentAt: patientsTable.verificationReminderSentAt,
      })
      .from(patientsTable)
      .where(and(
        eq(patientsTable.emailVerified, false),
        lte(patientsTable.createdAt, initialCutoff),
        or(
          isNull(patientsTable.verificationReminderSentAt),
          lte(patientsTable.verificationReminderSentAt, reminderCutoff),
        ),
        or(
          isNull(patientsTable.verificationReminderLastAttemptAt),
          lte(patientsTable.verificationReminderLastAttemptAt, retryCutoff),
        ),
        or(
          isNull(patientsTable.verificationReminderClaimedAt),
          lte(patientsTable.verificationReminderClaimedAt, claimCutoff),
        ),
        isNull(patientsTable.verificationReminderPendingAt),
      ))
      .limit(BATCH_SIZE);

    for (const candidate of candidates) {
      const claimId = randomBytes(16).toString("hex");
      const [claimed] = await db
        .update(patientsTable)
        .set({
          verificationReminderClaimedAt: now,
          verificationReminderClaimId: claimId,
          verificationReminderLastAttemptAt: now,
        })
        .where(and(
          eq(patientsTable.id, candidate.id),
          eq(patientsTable.emailVerified, false),
          lte(patientsTable.createdAt, initialCutoff),
          or(
            isNull(patientsTable.verificationReminderSentAt),
            lte(patientsTable.verificationReminderSentAt, reminderCutoff),
          ),
          or(
            isNull(patientsTable.verificationReminderLastAttemptAt),
            lte(patientsTable.verificationReminderLastAttemptAt, retryCutoff),
          ),
          or(
            isNull(patientsTable.verificationReminderClaimedAt),
            lte(patientsTable.verificationReminderClaimedAt, claimCutoff),
          ),
          isNull(patientsTable.verificationReminderPendingAt),
        ))
        .returning({ id: patientsTable.id });

      if (!claimed) continue;

      let verificationTokenId: number | null = null;
      let pendingDispatchSaved = false;
      let smtpStarted = false;
      try {
        const [stillUnverified] = await db
          .select({ id: patientsTable.id })
          .from(patientsTable)
          .where(and(
            eq(patientsTable.id, candidate.id),
            eq(patientsTable.emailVerified, false),
            eq(patientsTable.verificationReminderClaimId, claimId),
          ));

        if (!stillUnverified) {
          await releaseClaim(candidate.id, claimId, candidate.lastSentAt);
          continue;
        }

        const token = randomBytes(48).toString("hex");
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        const [verificationToken] = await db.insert(loginTokensTable).values({
          token,
          patientId: candidate.id,
          nextUrl: "/portal/dashboard",
          expiresAt,
          used: false,
        }).returning({ id: loginTokensTable.id });
        verificationTokenId = verificationToken.id;

        const [dispatchPending] = await db
          .update(patientsTable)
          .set({
            verificationReminderPendingAt: now,
            verificationReminderPendingTokenId: verificationTokenId,
          })
          .where(and(
            eq(patientsTable.id, candidate.id),
            eq(patientsTable.emailVerified, false),
            eq(patientsTable.verificationReminderClaimId, claimId),
          ))
          .returning({ id: patientsTable.id });

        if (!dispatchPending) {
          await discardVerificationToken(verificationTokenId, candidate.id);
          await releaseClaim(candidate.id, claimId, candidate.lastSentAt);
          continue;
        }
        pendingDispatchSaved = true;

        const [readyToSend] = await db
          .select({ id: patientsTable.id })
          .from(patientsTable)
          .where(and(
            eq(patientsTable.id, candidate.id),
            eq(patientsTable.emailVerified, false),
            eq(patientsTable.verificationReminderClaimId, claimId),
            eq(patientsTable.verificationReminderPendingAt, now),
          ));

        if (!readyToSend) {
          await discardVerificationToken(verificationTokenId, candidate.id);
          await releaseClaim(candidate.id, claimId, candidate.lastSentAt);
          continue;
        }

        const [dispatchStarted] = await db
          .update(patientsTable)
          .set({ verificationReminderDispatchStartedAt: now })
          .where(and(
            eq(patientsTable.id, candidate.id),
            eq(patientsTable.emailVerified, false),
            eq(patientsTable.verificationReminderClaimId, claimId),
            eq(patientsTable.verificationReminderPendingAt, now),
            eq(patientsTable.verificationReminderPendingTokenId, verificationTokenId),
          ))
          .returning({ id: patientsTable.id });

        if (!dispatchStarted) {
          await discardVerificationToken(verificationTokenId, candidate.id);
          await releaseClaim(candidate.id, claimId, candidate.lastSentAt);
          continue;
        }

        const verifyUrl = `${getVerificationFrontendUrl()}/api/patient/auth/verify?token=${token}`;
        smtpStarted = true;
        const sent = await sendMagicLink({
          to: candidate.email,
          name: candidate.name,
          verifyUrl,
          isNewAccount: false,
          isVerificationReminder: true,
        });

        if (!sent) {
          await discardVerificationToken(verificationTokenId, candidate.id);
          await releaseClaim(candidate.id, claimId, candidate.lastSentAt);
          console.warn(`[verification-reminders] SMTP is not configured; retrying patient ${candidate.id} later`);
          continue;
        }

        await db
          .update(patientsTable)
          .set({
            verificationReminderSentAt: now,
            verificationReminderCount: sql`${patientsTable.verificationReminderCount} + 1`,
            verificationReminderClaimedAt: null,
            verificationReminderClaimId: null,
            verificationReminderPendingAt: null,
            verificationReminderPendingTokenId: null,
            verificationReminderDispatchStartedAt: null,
          })
          .where(and(
            eq(patientsTable.id, candidate.id),
            eq(patientsTable.verificationReminderClaimId, claimId),
          ));

        console.log(`[verification-reminders] sent reminder for patient ${candidate.id}`);
      } catch (error) {
        if (!pendingDispatchSaved || !smtpStarted) {
          if (verificationTokenId !== null) {
            await discardVerificationToken(verificationTokenId, candidate.id);
          }
          await releaseClaim(candidate.id, claimId, candidate.lastSentAt);
          console.error(`[verification-reminders] pre-dispatch failed for patient ${candidate.id}`, error);
          continue;
        }

        // SMTP/network errors can occur after the provider has accepted the
        // message. Keep this token valid and count the dispatch rather than
        // risking a duplicate reminder on a later retry.
        await finalizeDispatch(candidate.id, claimId, now);
        console.error(`[verification-reminders] delivery outcome was indeterminate for patient ${candidate.id}`, error);
      }
    }
  } finally {
    workerRunning = false;
  }
}

async function discardVerificationToken(tokenId: number, patientId: number) {
  await db.delete(loginTokensTable)
    .where(eq(loginTokensTable.id, tokenId))
    .catch((tokenError) => {
      console.error(`[verification-reminders] failed to discard token for patient ${patientId}`, tokenError);
    });
}

async function releaseClaim(patientId: number, claimId: string, previousSentAt: Date | null) {
  await db
    .update(patientsTable)
    .set({
      verificationReminderClaimedAt: null,
      verificationReminderClaimId: null,
      verificationReminderSentAt: previousSentAt,
      verificationReminderPendingAt: null,
      verificationReminderPendingTokenId: null,
      verificationReminderDispatchStartedAt: null,
    })
    .where(and(
      eq(patientsTable.id, patientId),
      eq(patientsTable.verificationReminderClaimId, claimId),
    ))
    .catch((releaseError) => {
      console.error(`[verification-reminders] failed to release claim for patient ${patientId}`, releaseError);
    });
}

async function finalizeDispatch(patientId: number, claimId: string, sentAt: Date) {
  await db
    .update(patientsTable)
    .set({
      verificationReminderSentAt: sentAt,
      verificationReminderCount: sql`${patientsTable.verificationReminderCount} + 1`,
      verificationReminderClaimedAt: null,
      verificationReminderClaimId: null,
      verificationReminderPendingAt: null,
      verificationReminderPendingTokenId: null,
      verificationReminderDispatchStartedAt: null,
    })
    .where(and(
      eq(patientsTable.id, patientId),
      eq(patientsTable.verificationReminderClaimId, claimId),
    ))
    .catch((finalizeError) => {
      console.error(`[verification-reminders] failed to finalize dispatch for patient ${patientId}`, finalizeError);
    });
}

async function finalizeStalePendingDispatches(claimCutoff: Date) {
  const staleDispatches = await db
    .select({
      id: patientsTable.id,
      claimId: patientsTable.verificationReminderClaimId,
      pendingAt: patientsTable.verificationReminderPendingAt,
      pendingTokenId: patientsTable.verificationReminderPendingTokenId,
      dispatchStartedAt: patientsTable.verificationReminderDispatchStartedAt,
      emailVerified: patientsTable.emailVerified,
    })
    .from(patientsTable)
    .where(and(
      lte(patientsTable.verificationReminderClaimedAt, claimCutoff),
      sql`${patientsTable.verificationReminderClaimId} IS NOT NULL`,
      sql`${patientsTable.verificationReminderPendingAt} IS NOT NULL`,
    ))
    .limit(BATCH_SIZE);

  for (const dispatch of staleDispatches) {
    if (!dispatch.claimId || !dispatch.pendingAt) continue;

    if (dispatch.emailVerified) {
      await db
        .update(patientsTable)
        .set({
          verificationReminderClaimedAt: null,
          verificationReminderClaimId: null,
          verificationReminderPendingAt: null,
          verificationReminderPendingTokenId: null,
          verificationReminderDispatchStartedAt: null,
        })
        .where(and(
          eq(patientsTable.id, dispatch.id),
          eq(patientsTable.verificationReminderClaimId, dispatch.claimId),
        ));
      continue;
    }

    if (!dispatch.dispatchStartedAt) {
      const [releasedPending] = await db
        .update(patientsTable)
        .set({
          verificationReminderClaimedAt: null,
          verificationReminderClaimId: null,
          verificationReminderPendingAt: null,
          verificationReminderPendingTokenId: null,
          verificationReminderDispatchStartedAt: null,
        })
        .where(and(
          eq(patientsTable.id, dispatch.id),
          eq(patientsTable.verificationReminderClaimId, dispatch.claimId),
          isNull(patientsTable.verificationReminderDispatchStartedAt),
        ))
        .returning({ pendingTokenId: patientsTable.verificationReminderPendingTokenId });

      if (!releasedPending) continue;
      if (releasedPending.pendingTokenId !== null) {
        await discardVerificationToken(releasedPending.pendingTokenId, dispatch.id);
      }
      console.warn(`[verification-reminders] released stale pre-dispatch work for patient ${dispatch.id}`);
      continue;
    }

    // Once SMTP dispatch starts, its outcome may be unknowable after a crash.
    // Prefer at-most-once reminders over sending a patient a duplicate email.
    await finalizeDispatch(dispatch.id, dispatch.claimId, dispatch.pendingAt);
    console.warn(`[verification-reminders] finalized stale dispatch for patient ${dispatch.id} without retrying`);
  }
}

function getVerificationFrontendUrl(): string {
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    return process.env.APP_URL || "https://susrutahospital.com";
  }
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) return `https://${domain}`;
  return process.env.APP_URL || "https://susrutahospital.com";
}

export function startVerificationReminderWorker(): () => void {
  const startup = setTimeout(() => {
    void sendVerificationReminders().catch((error) => {
      console.error("[verification-reminders] scheduled run failed", error);
    });
  }, 60_000);
  const interval = setInterval(() => {
    void sendVerificationReminders().catch((error) => {
      console.error("[verification-reminders] scheduled run failed", error);
    });
  }, RUN_INTERVAL_MS);

  startup.unref();
  interval.unref();

  return () => {
    clearTimeout(startup);
    clearInterval(interval);
  };
}