import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  calculateDaysRemaining,
  isCancellationPeriodActive,
  formatDeletionRequest,
  CANCELLATION_PERIOD_DAYS,
  CANCELLATION_PERIOD_MS,
} from "./deletion-service";
import type { AccountDeletionRequest } from "@workspace/db";

describe("15-Day Account Deletion Cancellation Period Unit Tests", () => {
  test("CANCELLATION_PERIOD_DAYS is exactly 15 days", () => {
    assert.equal(CANCELLATION_PERIOD_DAYS, 15);
    assert.equal(CANCELLATION_PERIOD_MS, 15 * 24 * 60 * 60 * 1000);
  });

  test("calculateDaysRemaining computes correct days remaining", () => {
    const now = new Date("2026-10-23T10:00:00Z");

    // Exactly 15 days in future
    const deadline15 = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    assert.equal(calculateDaysRemaining(deadline15, now), 15);

    // 12 days and 3 hours in future -> rounds up to 13 days
    const deadline12d3h = new Date(now.getTime() + (12 * 24 + 3) * 60 * 60 * 1000);
    assert.equal(calculateDaysRemaining(deadline12d3h, now), 13);

    // Exactly 12 days in future
    const deadline12 = new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000);
    assert.equal(calculateDaysRemaining(deadline12, now), 12);

    // 5 hours remaining on 15th day -> 1 day remaining
    const deadline5h = new Date(now.getTime() + 5 * 60 * 60 * 1000);
    assert.equal(calculateDaysRemaining(deadline5h, now), 1);

    // 1 second in future -> 1 day remaining
    const deadline1s = new Date(now.getTime() + 1000);
    assert.equal(calculateDaysRemaining(deadline1s, now), 1);

    // Exactly at deadline -> 0 days remaining
    assert.equal(calculateDaysRemaining(now, now), 0);

    // Past deadline -> 0 days remaining
    const pastDeadline = new Date(now.getTime() - 3600000);
    assert.equal(calculateDaysRemaining(pastDeadline, now), 0);

    // Null or invalid input
    assert.equal(calculateDaysRemaining(null, now), 0);
    assert.equal(calculateDaysRemaining(undefined, now), 0);
    assert.equal(calculateDaysRemaining("invalid-date", now), 0);
  });

  test("isCancellationPeriodActive accurately detects active vs expired periods", () => {
    const now = new Date("2026-10-23T10:00:00Z");
    const futureDeadline = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
    const pastDeadline = new Date(now.getTime() - 1000);

    // PENDING with future deadline -> active
    assert.equal(isCancellationPeriodActive("PENDING", futureDeadline, now), true);

    // PENDING with past deadline -> expired (inactive)
    assert.equal(isCancellationPeriodActive("PENDING", pastDeadline, now), false);

    // PENDING with exact deadline -> expired (inactive)
    assert.equal(isCancellationPeriodActive("PENDING", now, now), false);

    // CANCELLED status -> always inactive even if deadline is future
    assert.equal(isCancellationPeriodActive("CANCELLED", futureDeadline, now), false);

    // ELIGIBLE_FOR_DELETION status -> always inactive
    assert.equal(isCancellationPeriodActive("ELIGIBLE_FOR_DELETION", futureDeadline, now), false);

    // DELETED / COMPLETED status -> always inactive
    assert.equal(isCancellationPeriodActive("DELETED", futureDeadline, now), false);
    assert.equal(isCancellationPeriodActive("COMPLETED", futureDeadline, now), false);
  });

  test("formatDeletionRequest evaluates active pending request", () => {
    const now = new Date("2026-10-23T10:00:00Z");
    const createdAt = now;
    const deadline = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);

    const mockRequest: AccountDeletionRequest = {
      id: 101,
      patientId: 42,
      patientCode: "P-042",
      patientName: "John Doe",
      patientEmail: "john@example.com",
      status: "PENDING",
      reason: "Relocating to another city",
      cancellationDeadline: deadline,
      cancelledAt: null,
      processedAt: null,
      processedBy: null,
      notes: null,
      isSeen: false,
      seenAt: null,
      deleteColumn: 0,
      createdAt,
    };

    const formatted = formatDeletionRequest(mockRequest, now);
    assert.equal(formatted.id, 101);
    assert.equal(formatted.status, "PENDING");
    assert.equal(formatted.isCancellationActive, true);
    assert.equal(formatted.daysRemaining, 15);
    assert.equal(formatted.cancellationDeadline, deadline.toISOString());
    assert.equal(formatted.cancelledAt, null);
  });

  test("formatDeletionRequest automatically evaluates status as ELIGIBLE_FOR_DELETION when 15 days expired", () => {
    const now = new Date("2026-11-10T10:00:00Z");
    const createdAt = new Date("2026-10-23T10:00:00Z");
    const deadline = new Date("2026-11-07T10:00:00Z"); // 15 days after Oct 23

    const mockRequest: AccountDeletionRequest = {
      id: 102,
      patientId: 43,
      patientCode: "P-043",
      patientName: "Jane Smith",
      patientEmail: "jane@example.com",
      status: "PENDING", // DB still says PENDING before sync
      reason: null,
      cancellationDeadline: deadline,
      cancelledAt: null,
      processedAt: null,
      processedBy: null,
      notes: null,
      isSeen: false,
      seenAt: null,
      deleteColumn: 0,
      createdAt,
    };

    const formatted = formatDeletionRequest(mockRequest, now);
    assert.equal(formatted.status, "ELIGIBLE_FOR_DELETION", "Status must become ELIGIBLE_FOR_DELETION once deadline passes");
    assert.equal(formatted.isCancellationActive, false);
    assert.equal(formatted.daysRemaining, 0);
  });

  test("formatDeletionRequest reflects CANCELLED status and cancelledAt timestamp", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const createdAt = new Date("2026-10-23T10:00:00Z");
    const deadline = new Date("2026-11-07T10:00:00Z");
    const cancelledAt = new Date("2026-10-24T09:00:00Z");

    const mockRequest: AccountDeletionRequest = {
      id: 103,
      patientId: 44,
      patientCode: "P-044",
      patientName: "Bob Taylor",
      patientEmail: "bob@example.com",
      status: "CANCELLED",
      reason: null,
      cancellationDeadline: deadline,
      cancelledAt,
      processedAt: null,
      processedBy: null,
      notes: "Cancelled by patient",
      isSeen: false,
      seenAt: null,
      deleteColumn: 0,
      createdAt,
    };

    const formatted = formatDeletionRequest(mockRequest, now);
    assert.equal(formatted.status, "CANCELLED");
    assert.equal(formatted.isCancellationActive, false);
    assert.equal(formatted.cancelledAt, cancelledAt.toISOString());
  });

  test("formatDeletionRequest reflects DELETED status after admin processing", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    const createdAt = new Date("2026-10-23T10:00:00Z");
    const deadline = new Date("2026-11-07T10:00:00Z");
    const processedAt = new Date("2026-11-10T15:30:00Z");

    const mockRequest: AccountDeletionRequest = {
      id: 104,
      patientId: null,
      patientCode: "P-045",
      patientName: "Alice Walker",
      patientEmail: "alice@example.com",
      status: "DELETED",
      reason: null,
      cancellationDeadline: deadline,
      cancelledAt: null,
      processedAt,
      processedBy: "admin",
      notes: "Account permanently deleted",
      isSeen: true,
      seenAt: processedAt,
      deleteColumn: 0,
      createdAt,
    };

    const formatted = formatDeletionRequest(mockRequest, now);
    assert.equal(formatted.status, "DELETED");
    assert.equal(formatted.isCancellationActive, false);
    assert.equal(formatted.processedAt, processedAt.toISOString());
    assert.equal(formatted.processedBy, "admin");
  });
});
