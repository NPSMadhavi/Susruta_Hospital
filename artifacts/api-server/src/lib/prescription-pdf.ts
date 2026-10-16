import { jsPDF } from "jspdf";

export interface PrescriptionPdfData {
  hospitalName?: string;
  hospitalAddress?: string;
  hospitalReg?: string;
  doctorName?: string;
  doctorDegree?: string;
  patientName: string;
  patientCode: string;
  ageGender: string;
  consultDate: string;
  diagnosis?: string;
  formulationRows?: Array<{
    medicines?: Array<{ name: string; dosage?: string }>;
    toBeTaken?: string;
    timing?: {
      morning?: { count?: string; mealRelation?: string };
      afternoon?: { count?: string; mealRelation?: string };
      night?: { count?: string; mealRelation?: string };
      breakfast?: { count?: string; mealRelation?: string };
      lunch?: { count?: string; mealRelation?: string };
      dinner?: { count?: string; mealRelation?: string };
    };
    duration?: string;
    quantity?: string;
    medicalNotes?: string;
    notes?: string;
  }>;
  medicines?: Array<{
    name: string;
    dosage?: string;
    duration?: string;
    morningBefore?: boolean;
    morningAfter?: boolean;
    afternoonBefore?: boolean;
    afternoonAfter?: boolean;
    nightBefore?: boolean;
    nightAfter?: boolean;
  }>;
  doctorNotes?: string;
}

/**
 * Strips any prepended medicine name prefix from medicine notes.
 * e.g. "Sitopaladi Churna: Take with Cold water" -> "Take with Cold water"
 */
function cleanMedicineNotes(rawNotes: string | undefined, medNames: string[]): string {
  if (!rawNotes) return "";
  let cleaned = rawNotes.trim();
  for (const name of medNames) {
    if (!name) continue;
    const regex = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
    cleaned = cleaned.replace(regex, "").trim();
  }
  return cleaned;
}

/**
 * Formats dosage timing into standard 1 - 0 - 1 (After Meal) representation.
 */
function formatTiming(timing: any): { code: string; relation: string } {
  if (!timing) return { code: "- - -", relation: "" };

  const getSlot = (k1: string, k2: string) => {
    const s = timing[k1] || timing[k2] || {};
    const count = Math.max(0, Math.min(1, Number(s.count) || 0));
    const meal = (count === 1 && (s.mealRelation === "before" || s.mealRelation === "after")) ? s.mealRelation : "";
    return { count, meal };
  };

  const m = getSlot("breakfast", "morning");
  const a = getSlot("lunch", "afternoon");
  const n = getSlot("dinner", "night");

  const code = `${m.count} - ${a.count} - ${n.count}`;
  let relation = "";
  if (m.meal === "after" || a.meal === "after" || n.meal === "after") {
    relation = "After Meal";
  } else if (m.meal === "before" || a.meal === "before" || n.meal === "before") {
    relation = "Before Meal";
  }

  return { code, relation };
}

/**
 * Generates a high quality A4 PDF matching the Digital Prescription design.
 */
export function generatePrescriptionPdf(data: PrescriptionPdfData): Buffer {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2; // 186mm

  // ── 1. HEADER ────────────────────────────────────────────────────────
  let currentY = 14;

  // Hospital Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(42, 67, 101); // #2A4365
  doc.text(data.hospitalName || "SUSRUTA HOSPITAL", marginX, currentY);

  // Doctor Details (Right-aligned)
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59); // #1E293B
  const docName = data.doctorName || "Dr. P. Murali Krishna";
  doc.text(docName, pageWidth - marginX, currentY - 1, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // #64748B
  const docDegree = data.doctorDegree || "B.A.M.S. (Gold Medalist), M.D. (Ay), Ph.D.";
  doc.text(docDegree, pageWidth - marginX, currentY + 3.5, { align: "right" });

  currentY += 5;

  // Address
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  const address = data.hospitalAddress || "119, Ramulavari North Mada Street, Tirupati - 517507 | Ph: 9492068180 / 0877-2220663";
  doc.text(address, marginX, currentY);

  currentY += 4;

  // Govt Reg
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(217, 91, 47); // #D95B2F
  const regNo = "Govt. Regd No: AYUR-TPT-2024  •  ISO 9001:2015 Certified";
  doc.text(regNo, marginX, currentY);

  currentY += 4;

  // Header divider line
  doc.setDrawColor(226, 232, 240); // #E2E8F0
  doc.setLineWidth(0.4);
  doc.line(marginX, currentY, pageWidth - marginX, currentY);

  currentY += 4;

  // ── 2. PATIENT DETAILS BANNER ─────────────────────────────────────────
  const bannerHeight = 16;
  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(marginX, currentY, contentWidth, bannerHeight, 2, 2, "FD");

  const colWidth = contentWidth / 4;

  // Col 1: Patient Name
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(148, 163, 184); // #94A3B8
  doc.text("PATIENT NAME", marginX + 4, currentY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42); // #0F172A
  doc.text(data.patientName || "-", marginX + 4, currentY + 11);

  // Col 2: Patient Code
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(148, 163, 184);
  doc.text("PATIENT ID", marginX + colWidth + 4, currentY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(data.patientCode || "-", marginX + colWidth + 4, currentY + 11);

  // Col 3: Age / Gender
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(148, 163, 184);
  doc.text("AGE / GENDER", marginX + colWidth * 2 + 4, currentY + 5);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(data.ageGender || "-", marginX + colWidth * 2 + 4, currentY + 11);

  // Col 4: Consult Date
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(148, 163, 184);
  doc.text("CONSULTATION DATE & TIME", marginX + colWidth * 3 + 4, currentY + 5);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text(data.consultDate || "-", marginX + colWidth * 3 + 4, currentY + 11);

  currentY += bannerHeight + 5;

  // ── 3. DIAGNOSIS ─────────────────────────────────────────────────────
  if (data.diagnosis && data.diagnosis.trim()) {
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(100, 116, 139);
    doc.text("CLINICAL DIAGNOSIS", marginX, currentY);

    currentY += 4;
    doc.setFillColor(254, 242, 242); // light reddish/amber tag or clean white
    doc.setDrawColor(254, 202, 202);
    doc.setLineWidth(0.2);
    const diagText = data.diagnosis.trim();
    const diagWidth = Math.min(contentWidth, doc.getTextWidth(diagText) + 8);
    doc.roundedRect(marginX, currentY - 3, diagWidth, 6, 1, 1, "FD");

    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(185, 28, 28); // #B91C1C
    doc.text(diagText, marginX + 4, currentY + 1.2);

    currentY += 7;
  }

  // ── 4. MEDICINES & FORMULATIONS TABLE ────────────────────────────────
  // Table Columns Widths (Total: 186mm)
  // S.NO: 12mm
  // Medicine & Formulation: 56mm
  // To Be Taken: 26mm
  // Dosage Timing: 52mm
  // Duration: 20mm
  // Quantity: 20mm
  const cols = [
    { header: "S.NO", width: 12, align: "center" as const },
    { header: "Medicine & Formulation", width: 56, align: "left" as const },
    { header: "To Be Taken", width: 26, align: "center" as const },
    { header: "Dosage Timing", width: 52, align: "center" as const },
    { header: "Duration", width: 20, align: "center" as const },
    { header: "Quantity", width: 20, align: "center" as const },
  ];

  const tableHeaderHeight = 7;
  doc.setFillColor(241, 245, 249); // #F1F5F9
  doc.setDrawColor(203, 213, 225); // #CBD5E1
  doc.setLineWidth(0.3);
  doc.rect(marginX, currentY, contentWidth, tableHeaderHeight, "FD");

  let colX = marginX;
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(51, 65, 85); // #334155

  for (const c of cols) {
    if (c.align === "center") {
      doc.text(c.header, colX + c.width / 2, currentY + 4.8, { align: "center" });
    } else {
      doc.text(c.header, colX + 3, currentY + 4.8);
    }
    colX += c.width;
    if (colX < marginX + contentWidth) {
      doc.line(colX, currentY, colX, currentY + tableHeaderHeight);
    }
  }

  currentY += tableHeaderHeight;

  // Normalize rows
  const allMedNames: string[] = [];
  const normalizedRows: Array<{
    sno: number;
    medName: string;
    dosage: string;
    toBeTaken: string;
    timingCode: string;
    timingRelation: string;
    duration: string;
    quantity: string;
    note: string;
  }> = [];

  if (data.formulationRows && data.formulationRows.length > 0) {
    data.formulationRows.forEach((r, idx) => {
      const primaryMed = r.medicines?.[0] || { name: "", dosage: "" };
      const medNotes = r.medicalNotes || r.notes || "";
      if (!primaryMed.name && !primaryMed.dosage && !medNotes) return;
      allMedNames.push(primaryMed.name);
      const timing = formatTiming(r.timing);
      normalizedRows.push({
        sno: idx + 1,
        medName: primaryMed.name || "-",
        dosage: primaryMed.dosage || "",
        toBeTaken: r.toBeTaken || "Orally",
        timingCode: timing.code,
        timingRelation: timing.relation,
        duration: r.duration ? `${r.duration} Days` : "-",
        quantity: r.quantity || "-",
        note: medNotes,
      });
    });
  } else if (data.medicines && data.medicines.length > 0) {
    data.medicines.forEach((m, idx) => {
      allMedNames.push(m.name);
      const mCount = (m.morningBefore || m.morningAfter) ? "1" : "0";
      const aCount = (m.afternoonBefore || m.afternoonAfter) ? "1" : "0";
      const nCount = (m.nightBefore || m.nightAfter) ? "1" : "0";
      const rel = (m.morningAfter || m.afternoonAfter || m.nightAfter) ? "After Meal" : ((m.morningBefore || m.afternoonBefore || m.nightBefore) ? "Before Meal" : "");
      normalizedRows.push({
        sno: idx + 1,
        medName: m.name,
        dosage: m.dosage || "",
        toBeTaken: "Orally",
        timingCode: `${mCount} - ${aCount} - ${nCount}`,
        timingRelation: rel,
        duration: m.duration || "-",
        quantity: "-",
        note: "",
      });
    });
  }

  const rowHeight = 14;
  for (const r of normalizedRows) {
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(marginX, currentY, contentWidth, rowHeight, "FD");

    let cellX = marginX;

    // Col 0: S.NO
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(String(r.sno), cellX + cols[0].width / 2, currentY + 8, { align: "center" });
    cellX += cols[0].width;
    doc.line(cellX, currentY, cellX, currentY + rowHeight);

    // Col 1: Medicine & Formulation
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(r.medName, cellX + 3, currentY + 5.5);
    if (r.dosage) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(r.dosage, cellX + 3, currentY + 10);
    }
    cellX += cols[1].width;
    doc.line(cellX, currentY, cellX, currentY + rowHeight);

    // Col 2: To Be Taken
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(r.toBeTaken, cellX + cols[2].width / 2, currentY + 8, { align: "center" });
    cellX += cols[2].width;
    doc.line(cellX, currentY, cellX, currentY + rowHeight);

    // Col 3: Dosage Timing
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(r.timingCode, cellX + cols[3].width / 2, currentY + 5.5, { align: "center" });
    if (r.timingRelation) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(`(${r.timingRelation})`, cellX + cols[3].width / 2, currentY + 10, { align: "center" });
    }
    cellX += cols[3].width;
    doc.line(cellX, currentY, cellX, currentY + rowHeight);

    // Col 4: Duration
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(r.duration, cellX + cols[4].width / 2, currentY + 8, { align: "center" });
    cellX += cols[4].width;
    doc.line(cellX, currentY, cellX, currentY + rowHeight);

    // Col 5: Quantity
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(r.quantity, cellX + cols[5].width / 2, currentY + 8, { align: "center" });

    currentY += rowHeight;

    // Medicine-specific Medical Notes directly below this medicine row
    const rawNote = cleanMedicineNotes(r.note, allMedNames);
    const noteBullets = rawNote
      ? rawNote
          .split("\n")
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .map(l => {
            const hasBullet = l.startsWith("•") || l.startsWith("-") || l.startsWith("*");
            return hasBullet ? l.replace(/^[•\-\*]\s*/, "").trim() : l;
          })
          .filter(l => l.length > 0)
      : [];

    if (noteBullets.length > 0) {
      const bulletLineHeight = 4.2;
      const noteBoxHeight = 5 + noteBullets.length * bulletLineHeight;

      doc.setFillColor(250, 249, 245); // #FAF9F5
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.rect(marginX, currentY, contentWidth, noteBoxHeight, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(71, 85, 105);
      doc.text("Medical Notes", marginX + 3, currentY + 3.8);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);

      let bulletY = currentY + 7.5;
      for (const bullet of noteBullets) {
        doc.text(`•  ${bullet}`, marginX + 4, bulletY);
        bulletY += bulletLineHeight;
      }

      currentY += noteBoxHeight;
    }
  }

  currentY += 6;

  // ── 6. GENERAL DOCTOR NOTES / ADVICE ──────────────────────────────────
  if (data.doctorNotes && data.doctorNotes.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text("DOCTOR'S ADVICE & GENERAL NOTES", marginX, currentY);
    currentY += 4.5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    const splitNotes = doc.splitTextToSize(data.doctorNotes.trim(), contentWidth - 4);
    doc.text(splitNotes, marginX + 3, currentY);
    currentY += splitNotes.length * 4.5 + 4;
  }

  // ── 7. FOOTER / SIGNATURE (Pinned above bottom margin) ────────────────
  const footerY = pageHeight - 32;

  // Signature Block (Right)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(docName, pageWidth - marginX - 5, footerY, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Authorized Medical Practitioner", pageWidth - marginX - 5, footerY + 4, { align: "right" });

  // Divider
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(marginX, footerY + 10, pageWidth - marginX, footerY + 10);

  // Bottom Notice
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text(
    "This is a computer-generated digital prescription validated by Susruta Hospital.",
    marginX,
    footerY + 15
  );
  doc.text("Helpline: 9492068180 | www.susrutahospital.com", pageWidth - marginX, footerY + 15, { align: "right" });

  return Buffer.from(doc.output("arraybuffer"));
}
