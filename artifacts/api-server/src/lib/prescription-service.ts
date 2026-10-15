import fs from "fs";
import path from "path";
import { type Response } from "express";
import { db, prescriptionsTable, onlineAppointmentsTable, onlineSlotsTable, appointmentsTable, patientsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generatePrescriptionPdf, type PrescriptionPdfData } from "./prescription-pdf";

export function getUploadsDirs(): string[] {
  const d1 = path.resolve(process.cwd(), "uploads");
  const d2 = path.resolve(import.meta.dirname, "../../uploads");
  const dirs = [d1, d2];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      try { fs.mkdirSync(d, { recursive: true }); } catch {}
    }
  }
  return dirs;
}

export function findExistingFile(filePathOrName: string): string | null {
  if (!filePathOrName) return null;
  const dirs = getUploadsDirs();
  const clean = filePathOrName
    .replace(/^\/(api\/)?(storage\/)?objects\/?(local-)?/, "")
    .replace(/^local-/, "")
    .replace(/^\//, "");

  const candidates = [
    clean,
    `local-${clean}`,
    path.basename(filePathOrName),
  ];

  for (const dir of dirs) {
    for (const c of candidates) {
      const p = path.join(dir, c);
      if (fs.existsSync(p) && fs.statSync(p).isFile()) {
        return p;
      }
    }
  }
  return null;
}

export function saveFileToUploads(fileName: string, buffer: Buffer, contentType = "application/pdf") {
  const dirs = getUploadsDirs();
  for (const dir of dirs) {
    try {
      fs.writeFileSync(path.join(dir, fileName), buffer);
      fs.writeFileSync(
        path.join(dir, `${fileName}.json`),
        JSON.stringify({ name: fileName, size: buffer.length, contentType }),
        "utf-8"
      );
    } catch (err) {
      console.warn("Could not save to upload dir", dir, err);
    }
  }
}

function formatFmtDateShort(d: Date | string | null | undefined): string {
  if (!d) return "Prescription";
  const dateObj = new Date(d);
  if (isNaN(dateObj.getTime())) return "Prescription";
  return dateObj.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

function formatFmtTimeIST(timeStr?: string | null): string {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    let h = parseInt(parts[0], 10);
    const m = parts[1].padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  return timeStr;
}

/**
 * Handles downloading a prescription as a real file with application/pdf headers.
 */
export async function streamPrescriptionDownload({
  rxIdOrApptParam,
  requestedFileName,
  authenticatedPatientId,
  res,
}: {
  rxIdOrApptParam: string;
  requestedFileName?: string;
  authenticatedPatientId?: number;
  res: Response;
}) {
  let rx: any = null;
  let onlineAppt: any = null;
  let offlineAppt: any = null;
  let slot: any = null;
  let patient: any = null;

  const rawParam = String(rxIdOrApptParam).trim();

  if (rawParam.startsWith("appt-")) {
    const parts = rawParam.split("-");
    const type = parts[1]; // "online" | "offline"
    const id = parseInt(parts[2], 10);

    if (type === "online") {
      const [row] = await db
        .select({
          appt: onlineAppointmentsTable,
          slot: onlineSlotsTable,
          patient: patientsTable,
          rx: prescriptionsTable,
        })
        .from(onlineAppointmentsTable)
        .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
        .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
        .leftJoin(prescriptionsTable, eq(prescriptionsTable.onlineAppointmentId, onlineAppointmentsTable.id))
        .where(eq(onlineAppointmentsTable.id, id));

      if (row) {
        onlineAppt = row.appt;
        slot = row.slot;
        patient = row.patient;
        rx = row.rx;
      }
    } else {
      const [row] = await db
        .select({
          appt: appointmentsTable,
          patient: patientsTable,
          rx: prescriptionsTable,
        })
        .from(appointmentsTable)
        .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
        .leftJoin(prescriptionsTable, eq(prescriptionsTable.appointmentId, appointmentsTable.id))
        .where(eq(appointmentsTable.id, id));

      if (row) {
        offlineAppt = row.appt;
        patient = row.patient;
        rx = row.rx;
      }
    }
  } else {
    const numId = parseInt(rawParam, 10);
    if (!isNaN(numId)) {
      // 1. Try by prescription ID
      const [pRow] = await db
        .select()
        .from(prescriptionsTable)
        .where(eq(prescriptionsTable.id, numId));

      if (pRow) {
        rx = pRow;
      } else {
        // 2. Try by online appointment ID
        const [oRow] = await db
          .select()
          .from(prescriptionsTable)
          .where(eq(prescriptionsTable.onlineAppointmentId, numId));
        if (oRow) {
          rx = oRow;
        } else {
          // 3. Try by offline appointment ID
          const [offRow] = await db
            .select()
            .from(prescriptionsTable)
            .where(eq(prescriptionsTable.appointmentId, numId));
          if (offRow) rx = offRow;
        }
      }
    }
  }

  // If rx was found by id, fetch its appointment & patient context
  if (rx && !patient) {
    if (rx.onlineAppointmentId) {
      const [row] = await db
        .select({
          appt: onlineAppointmentsTable,
          slot: onlineSlotsTable,
          patient: patientsTable,
        })
        .from(onlineAppointmentsTable)
        .innerJoin(onlineSlotsTable, eq(onlineAppointmentsTable.slotId, onlineSlotsTable.id))
        .innerJoin(patientsTable, eq(onlineAppointmentsTable.patientId, patientsTable.id))
        .where(eq(onlineAppointmentsTable.id, rx.onlineAppointmentId));

      if (row) {
        onlineAppt = row.appt;
        slot = row.slot;
        patient = row.patient;
      }
    } else if (rx.appointmentId) {
      const [row] = await db
        .select({
          appt: appointmentsTable,
          patient: patientsTable,
        })
        .from(appointmentsTable)
        .leftJoin(patientsTable, eq(appointmentsTable.patientId, patientsTable.id))
        .where(eq(appointmentsTable.id, rx.appointmentId));

      if (row) {
        offlineAppt = row.appt;
        patient = row.patient;
      }
    }
  }

  if (!rx && !onlineAppt && !offlineAppt) {
    res.status(404).json({ error: "prescription_not_found", message: "Prescription record not found." });
    return;
  }

  // Security check for patient portal
  if (authenticatedPatientId && patient && patient.id !== authenticatedPatientId) {
    res.status(403).json({ error: "forbidden", message: "Access denied to this prescription." });
    return;
  }

  // Construct standard filename, e.g. "Prescription_11_Oct.pdf"
  const dateVal = slot?.date || offlineAppt?.date || rx?.createdAt;
  const dateStrShort = formatFmtDateShort(dateVal);
  let standardFileName = `Prescription_${dateStrShort.replace(/ /g, "_")}.pdf`;

  if (requestedFileName && requestedFileName.endsWith(".pdf") && !requestedFileName.includes("/") && !requestedFileName.includes("\\")) {
    standardFileName = requestedFileName;
  }

  // CASE 1: Uploaded Photo/Document file
  if (rx?.photoObjectPath) {
    const existingFilePath = findExistingFile(rx.photoObjectPath);
    if (existingFilePath) {
      const stat = fs.statSync(existingFilePath);
      const isPdf = existingFilePath.toLowerCase().endsWith(".pdf") || standardFileName.toLowerCase().endsWith(".pdf");
      const contentType = isPdf ? "application/pdf" : "image/jpeg";

      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(standardFileName)}"`);
      res.setHeader("Content-Length", stat.size);
      res.setHeader("Cache-Control", "no-cache");
      fs.createReadStream(existingFilePath).pipe(res);
      return;
    }
  }

  // CASE 2: Check if PDF already generated and stored on server disk
  const rxIdKey = rx?.id ? `prescription-${rx.id}.pdf` : `prescription-${rawParam}.pdf`;
  const cachedFilePath = findExistingFile(rxIdKey);

  if (cachedFilePath) {
    const stat = fs.statSync(cachedFilePath);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(standardFileName)}"`);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-cache");
    fs.createReadStream(cachedFilePath).pipe(res);
    return;
  }

  // CASE 3: Generate PDF server-side and persist to storage
  let rawNotes = rx?.notes || offlineAppt?.notes || "";
  let digitalData: any = null;
  if (typeof rawNotes === "string" && rawNotes.trim().startsWith("{")) {
    try { digitalData = JSON.parse(rawNotes); } catch {}
  }

  let slotTime = "";
  if (slot?.startTime && slot?.endTime) {
    slotTime = `${formatFmtTimeIST(slot.startTime)} – ${formatFmtTimeIST(slot.endTime)}`;
  } else if (offlineAppt?.timeSlot) {
    slotTime = offlineAppt.timeSlot;
  }

  const consultDateStr = dateStrShort !== "Prescription" 
    ? `${dateStrShort} 2026 • ${slotTime}`
    : "11 Oct 2026 • 10:31 AM – 10:45 AM";

  const patAge = patient?.age ? String(patient.age) : "";
  const patGender = patient?.gender || "";
  const patAgeGender = [patAge, patGender].filter(Boolean).join(" / ") || "-";

  const pdfData: PrescriptionPdfData = {
    patientName: patient?.name || offlineAppt?.patientName || "Patient",
    patientCode: patient?.patientCode || (patient?.id ? `A${String(patient.id).padStart(3, "0")}` : "A001"),
    ageGender: patAgeGender,
    consultDate: consultDateStr,
    diagnosis: digitalData?.diagnosis || "",
    formulationRows: digitalData?.formulationRows || [],
    doctorNotes: digitalData?.notes || (typeof rawNotes === "string" && !rawNotes.startsWith("{") ? rawNotes : ""),
  };

  const pdfBuffer = generatePrescriptionPdf(pdfData);

  // Persist to server uploads disk so future requests stream immediately
  saveFileToUploads(rxIdKey, pdfBuffer);
  saveFileToUploads(standardFileName, pdfBuffer);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(standardFileName)}"`);
  res.setHeader("Content-Length", pdfBuffer.length);
  res.setHeader("Cache-Control", "no-cache");
  res.send(pdfBuffer);
}
