import React, { useMemo } from "react";
import "./prescription-document.css";
import { format } from "date-fns";
import { Users, FileEdit } from "lucide-react";
import { HOSPITAL_LOGO_DATA_URL } from "@/lib/hospital-logo-b64";
import type { PrintPrescriptionData } from "@/lib/prescription-download";

export function parseConsultDateTime(rawDate?: string) {
  let raw = (rawDate || "").trim();
  // Strip weekday prefix if present (e.g. "Sun, ")
  raw = raw.replace(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*,\s*/i, "").trim();

  let datePart = "";
  let timePart = "";

  if (raw.includes("•")) {
    const parts = raw.split("•");
    datePart = parts[0].trim();
    timePart = parts.slice(1).join(" ").trim();
  } else if (raw.includes(",")) {
    const lastCommaIdx = raw.lastIndexOf(",");
    datePart = raw.slice(0, lastCommaIdx).trim();
    timePart = raw.slice(lastCommaIdx + 1).trim();
  } else {
    datePart = raw || "-";
  }

  // Clean comma inside date if needed, e.g. "11 Oct, 2026" -> "11 Oct 2026"
  datePart = datePart.replace(/,\s*/g, " ").trim();

  if (timePart && !timePart.includes("IST")) {
    timePart = `${timePart} IST`;
  }

  return { date: datePart || "-", time: timePart };
}

export function parseNotesToBullets(rawNotes: string | null | undefined): string[] {
  if (!rawNotes || typeof rawNotes !== "string") return [];
  return rawNotes
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      const hasBullet = line.startsWith("•") || line.startsWith("-") || line.startsWith("*");
      return hasBullet ? line.replace(/^[•\-\*]\s*/, "").trim() : line;
    })
    .filter(line => line.length > 0);
}

export function DigitalPrescriptionPages({ data }: { data: PrintPrescriptionData }) {
  const patientName = data.patientName || "-";
  const patientCode = data.patientCode || "-";

  const parseAge = () => {
    let raw =
      data.age ||
      (data.ageGender ? String(data.ageGender).split("/")[0] : "") ||
      "";
    raw = String(raw).trim();
    if (!raw) return "";
    raw = raw.replace(/\s*(years?|y)\s*$/i, "").trim();
    return raw;
  };

  const parseGender = () => {
    let raw = data.gender || (data.ageGender ? String(data.ageGender).split("/")[1] : "") || "";
    raw = String(raw).trim();
    if (!raw) return "";
    if (/^female$/i.test(raw)) return "Female";
    if (/^male$/i.test(raw)) return "Male";
    return raw;
  };

  const displayAge = parseAge();
  const displayGender = parseGender();
  const displayAgeGender = [displayAge, displayGender].filter(Boolean).join(" / ") || "-";

  const consultInfo = parseConsultDateTime(data.consultDate);
  const diagnosisText = data.diagnosis?.trim() || "-";

  // Rows normalization
  const rows = useMemo(() => {
    const normalizeTimingObj = (t: any) => {
      const getSlot = (sName: "breakfast" | "lunch" | "dinner", legacyName: "morning" | "afternoon" | "night") => {
        const slot = t?.[sName] || t?.[legacyName] || {};
        const count = Math.max(0, Math.min(1, Number(slot.count) || 0));
        const mealRelation = (count === 1 && (slot.mealRelation === "before" || slot.mealRelation === "after"))
          ? slot.mealRelation
          : "";
        return { count: String(count), mealRelation };
      };

      const b = getSlot("breakfast", "morning");
      const l = getSlot("lunch", "afternoon");
      const d = getSlot("dinner", "night");

      return {
        breakfast: b,
        lunch: l,
        dinner: d,
        morning: b,
        afternoon: l,
        night: d,
      };
    };

    if (data.formulationRows && data.formulationRows.length > 0) {
      const validRows = data.formulationRows.filter(r =>
        r.medicines && r.medicines.some(m => m.name && m.name.trim().length > 0)
      );
      if (validRows.length > 0) {
        return validRows.map(r => ({
          id: r.id,
          medicines: r.medicines.filter(m => m.name && m.name.trim().length > 0),
          toBeTaken: r.toBeTaken || "-",
          timing: normalizeTimingObj(r.timing),
          duration: r.duration || "-",
          quantity: r.quantity || "-",
          medicalNotes: (r.medicalNotes ?? r.notes ?? "") || "",
          notes: (r.medicalNotes ?? r.notes ?? "") || "",
        }));
      }
    }

    if (data.medicines && data.medicines.length > 0) {
      const validMeds = data.medicines.filter(m => m.name && m.name.trim().length > 0);
      if (validMeds.length > 0) {
        return validMeds.map((m: any, idx) => {
          const morningCount = (m.morningBefore || m.morningAfter) ? "1" : "0";
          const morningRel = m.morningAfter ? "after" : (m.morningBefore ? "before" : "");
          const afternoonCount = (m.afternoonBefore || m.afternoonAfter) ? "1" : "0";
          const afternoonRel = m.afternoonAfter ? "after" : (m.afternoonBefore ? "before" : "");
          const nightCount = (m.nightBefore || m.nightAfter) ? "1" : "0";
          const nightRel = m.nightAfter ? "after" : (m.nightBefore ? "before" : "");

          const tObj = {
            morning: { count: morningCount, mealRelation: morningRel },
            afternoon: { count: afternoonCount, mealRelation: afternoonRel },
            night: { count: nightCount, mealRelation: nightRel },
          };

          return {
            id: m.id || String(idx),
            medicines: [{
              id: m.id || String(idx),
              name: m.name,
              dosage: "",
            }],
            toBeTaken: "-",
            timing: normalizeTimingObj(tObj),
            duration: m.duration || "-",
            quantity: "-",
            medicalNotes: (m.medicalNotes || m.notes || ""),
            notes: (m.medicalNotes || m.notes || ""),
          };
        });
      }
    }

    return [];
  }, [data.formulationRows, data.medicines]);

  // Multi-page A4 row chunking: STRICT MAXIMUM OF 3 MEDICINES PER A4 PAGE
  const CHUNK_SIZE = 3;
  const pages = useMemo(() => {
    if (!rows || rows.length === 0) {
      return [{ pageIndex: 0, startIndex: 0, rows: [] }];
    }
    const result: { pageIndex: number; startIndex: number; rows: typeof rows }[] = [];
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      result.push({
        pageIndex: Math.floor(i / CHUNK_SIZE),
        startIndex: i,
        rows: rows.slice(i, i + CHUNK_SIZE),
      });
    }
    return result;
  }, [rows]);

  return (
    <>
      {pages.map((pageData, pageIndex) => {
        const isFinalPage = pageIndex === pages.length - 1;

        return (
          <div
            key={pageIndex}
            className="prescription-print-page relative w-[210mm] min-h-[297mm] h-[297mm] max-h-[297mm] bg-white shadow-2xl rounded-xs border border-slate-300/60 flex flex-col box-border overflow-hidden select-text text-[#1E293B]"
            style={{
              fontFamily: "'DM Sans', sans-serif",
              width: "210mm",
              minHeight: "297mm",
              height: "297mm",
              maxHeight: "297mm",
              padding: "9mm 9mm 14mm 9mm",
              boxSizing: "border-box",
            }}
          >
            {/* Subtle Full-Page Emblem Watermark on EVERY page */}
            <div className="prescription-watermark absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
              <img
                src={HOSPITAL_LOGO_DATA_URL}
                alt=""
                className="w-72 sm:w-80 h-auto opacity-[0.045] pointer-events-none"
                style={{ width: "320px", height: "auto", opacity: 0.045 }}
                crossOrigin="anonymous"
              />
            </div>

            {/* Main Top Prescription Content */}
            <div className="prescription-main-content relative z-10 w-full flex flex-col">
              {/* Hospital Header on EVERY page */}
              <div className="flex flex-row items-start gap-4 w-full">

                {/* LEFT - Hospital Information */}
                <div className="flex-1 min-w-0">

                  <div className="flex items-center gap-2 mb-1.5">
                    <img
                      src={HOSPITAL_LOGO_DATA_URL}
                      alt=""
                      className="w-10 h-10 object-contain shrink-0"
                      crossOrigin="anonymous"
                    />

                    <h1
                      className="font-extrabold text-2xl tracking-wider text-[#2A4365]"
                      style={{ fontFamily: "'DM Sans', sans-serif" }}
                    >
                      SUSRUTA HOSPITAL
                    </h1>
                  </div>

                  {/* Tagline */}
                  <div className="inline-block bg-[#3C4C8C] text-white rounded-sm px-4 py-2 mt-2 mb-2">
                    <p className="text-[10px] font-bold leading-none whitespace-nowrap">
                      An Exclusive Ayurvedic Medical Care
                    </p>
                  </div>

                  {/* Address */}
                  <p className="text-xs text-[#64748B] font-medium leading-relaxed">
                    119, Ramulavari North Mada Street, Tirupati - 517 507
                  </p>

                  {/* Appointment */}
                  <p className="text-[10px] font-semibold text-[#555] leading-tight mt-2 whitespace-nowrap">
                    <span className="text-[#2B2220]">
                      For Appointment :
                    </span>{" "}
                    9492068180, 0877-2220663{" "}
                    <span className="font-normal">
                      (Call during working hours only)
                    </span>
                  </p>

                  {/* Consulting Hours - ONE LINE */}
                  <p className="text-[10px] font-semibold text-[#555] leading-tight mt-1.5 whitespace-nowrap">
                    <span className="text-[#2B2220]">
                      Consulting Hours :
                    </span>{" "}
                    Week Days - Morning : 10-00 AM to 01.30 PM - Evening : 06-00 PM to
                    10-00 PM - Sunday : 10-00 AM to 01.00 PM
                  </p>

                </div>

                {/* RIGHT - Doctor Information */}
                <div className="w-[285px] shrink-0 text-right pt-1">

                  <h3 className="font-extrabold text-[#1E293B] text-base leading-tight whitespace-nowrap">
                    Dr. P. Murali Krishna
                  </h3>

                  <p className="text-[10px] text-slate-500 font-medium mt-1 leading-tight whitespace-nowrap">
                    B.A.M.S. (Gold Medalist), M.D. (Ay), Ph.D.,FRAV. D.Yoga
                  </p>

                  <p className="text-[10px] text-[#D95B2F] font-medium mt-1 whitespace-nowrap">
                    Consultant Ayurvedic Specialist
                  </p>

                </div>

              </div>

              {/* Header Divider line on EVERY page */}
              <div className="w-full border-t border-slate-200/90 my-3"></div>

              {/* Page 1 Specific Sections */}
              {pageIndex === 0 ? (
                <>
                  {/* Patient Details Banner */}
                  <div className="bg-[#FAF7F2] border border-[#EFE9DF] rounded-xl p-3 sm:p-3.5 mb-3.5 shadow-2xs overflow-hidden">
                    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1.2fr)] gap-x-3 text-xs items-start w-full">
                      {/* Patient Name */}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[#8C7E72] tracking-wider mb-0.5">
                          Patient Full Name
                        </p>
                        <p className="font-extrabold text-sm text-[#1E293B] truncate">
                          {patientName}
                        </p>
                      </div>

                      {/* Patient ID */}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[#8C7E72] tracking-wider mb-0.5">
                          Patient ID/IPD
                        </p>
                        <p className="font-extrabold text-sm text-[#D95B2F] font-mono truncate">
                          {patientCode}
                        </p>
                      </div>

                      {/* Age / Gender */}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[#8C7E72] tracking-wider mb-0.5">
                          Age / Gender
                        </p>
                        <p className="font-extrabold text-sm text-[#1E293B]">
                          {displayAgeGender}
                        </p>
                      </div>

                      {/* Date & Time */}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-[#8C7E72] tracking-wider mb-0.5">
                          Date Of Consult & Time
                        </p>
                        <p className="font-bold text-sm text-[#1E293B] leading-tight break-words">
                          {consultInfo.date}
                          {consultInfo.time ? `, ${consultInfo.time}` : ""}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Diagnosis Section */}
                  <div className="mb-3">
                    <h4 className="font-extrabold text-sm text-[#1E293B] mb-1">Diagnosis</h4>
                    {diagnosisText === "-" ? (
                      <p className="text-xs sm:text-sm text-[#475569] font-medium pl-1">-</p>
                    ) : (
                      <div className="text-xs sm:text-sm text-[#475569] font-medium pl-1 whitespace-pre-line leading-relaxed break-words space-y-0.5">
                        {diagnosisText.split("\n").map((line, i) => {
                          const trimmed = line.trim();
                          if (!trimmed) return null;
                          const hasBullet = trimmed.startsWith("•") || trimmed.startsWith("-") || trimmed.startsWith("*");
                          return (
                            <div key={i} className="flex items-start gap-1.5 leading-snug">
                              <span className="text-[#1E293B] font-bold text-sm leading-none mt-0.5">•</span>
                              <span>{hasBullet ? trimmed.replace(/^[•\-\*]\s*/, "") : trimmed}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Ayurvedic Medicinal Formulations Heading */}
                  <div className="mb-2">
                    <h4 className="font-extrabold text-sm text-[#1E293B] mb-0.5">
                      Ayurvedic Medicinal Formulations
                    </h4>
                    <p className="text-[11px] text-[#64748B] font-medium">
                      Administer precisely as charted below with indicated Anupana
                    </p>
                  </div>
                </>
              ) : (
                /* Continuation Heading on Page 2+ */
                <div className="mb-2">
                  <h4 className="font-extrabold text-sm text-[#1E293B] mb-0.5">
                    Ayurvedic Medicinal Formulations (Continued)
                  </h4>
                </div>
              )}

              {/* Prescription Table — real HTML table for continuous column dividers */}
              {pageData.rows.length > 0 && (
                <table
                  className="w-full text-xs"
                  style={{
                    borderCollapse: "collapse",
                    tableLayout: "fixed",
                    border: "1px solid #DFD9CE",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <colgroup>
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "27%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "9%" }} />
                    <col style={{ width: "13.5%" }} />
                    <col style={{ width: "13.5%" }} />
                  </colgroup>

                  <thead>
                    <tr style={{ backgroundColor: "#EDE8DC" }}>
                      <th
                        rowSpan={2}
                        className="text-center text-[11px] font-bold text-[#475569] tracking-wide"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "8px 2px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        S.NO
                      </th>
                      <th
                        rowSpan={2}
                        className="text-left text-[11px] font-bold text-[#475569] tracking-wide"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "8px 6px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Medicine &amp; Formulation
                      </th>
                      <th
                        rowSpan={2}
                        className="text-center text-[11px] font-bold text-[#475569] tracking-wide"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "8px 4px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        To Be Taken
                      </th>
                      <th
                        colSpan={3}
                        className="text-center text-[10.5px] font-bold text-[#475569] tracking-wide"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "6px 2px 3px",
                          verticalAlign: "middle",
                          lineHeight: "1.2",
                        }}
                      >
                        Dosage Timing &amp; Food Association
                      </th>
                      <th
                        rowSpan={2}
                        className="text-center text-[11px] font-bold text-[#475569] tracking-wide"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "8px 4px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Duration
                      </th>
                      <th
                        rowSpan={2}
                        className="text-center text-[11px] font-bold text-[#475569] tracking-wide"
                        style={{
                          borderBottom: "1px solid #DFD9CE",
                          padding: "8px 4px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Quantity
                      </th>
                    </tr>
                    <tr style={{ backgroundColor: "#EDE8DC" }}>
                      <th
                        className="text-center text-[9px] font-semibold text-[#64748B]"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "3px 2px 5px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Breakfast
                      </th>
                      <th
                        className="text-center text-[9px] font-semibold text-[#64748B]"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "3px 2px 5px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Lunch
                      </th>
                      <th
                        className="text-center text-[9px] font-semibold text-[#64748B]"
                        style={{
                          borderRight: "1px solid #DFD9CE",
                          borderBottom: "1px solid #DFD9CE",
                          padding: "3px 2px 5px",
                          verticalAlign: "middle",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Dinner
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pageData.rows.map((row, rIdx) => {
                      const globalIdx = pageData.startIndex + rIdx;
                      const isLastItem = rIdx === pageData.rows.length - 1;
                      const bulletPoints = parseNotesToBullets(row.medicalNotes ?? row.notes);
                      const hasNotes = bulletPoints.length > 0;

                      return (
                        <React.Fragment key={row.id || globalIdx}>
                          <tr className="bg-white break-inside-avoid" style={{ pageBreakInside: "avoid" }}>
                            {/* S.NO */}
                            <td
                              className="text-center font-bold text-slate-500 text-sm"
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "8px 2px",
                                verticalAlign: "middle",
                              }}
                            >
                              {String(globalIdx + 1).padStart(2, "0")}
                            </td>

                            {/* Medicine & Formulation */}
                            <td
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "8px 6px",
                                verticalAlign: "middle",
                              }}
                            >
                              <div className="space-y-1">
                                {row.medicines.length > 1 && (
                                  <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FFF5F2] border border-[#FDCFBF] text-[#D95B2F] text-[9px] font-bold mb-0.5 shadow-2xs w-fit whitespace-nowrap">
                                    <Users size={10} className="shrink-0" />
                                    <span className="whitespace-nowrap">Combined Set</span>
                                  </div>
                                )}
                                {row.medicines.map((m) => (
                                  <div key={m.id}>
                                    <div className="font-bold text-xs text-[#1E293B] leading-snug break-words" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                                      {m.name}
                                    </div>
                                    {m.dosage && (
                                      <div className="text-[11px] font-semibold text-[#D95B2F] mt-0.5 leading-snug break-words">
                                        {m.dosage}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </td>

                            {/* To Be Taken */}
                            <td
                              className="text-center font-semibold text-xs text-[#475569]"
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "8px 4px",
                                verticalAlign: "middle",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {row.toBeTaken || "-"}
                            </td>

                            {/* Breakfast */}
                            <td
                              className="text-center"
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "6px 2px",
                                verticalAlign: "middle",
                              }}
                            >
                              <div className="flex flex-col items-center justify-center gap-1 mx-auto">
                                <span className="w-5 h-5 border border-slate-200 rounded text-[10px] font-bold text-[#1E293B] bg-[#FAF9F5] inline-flex items-center justify-center">
                                  {row.timing.breakfast.count}
                                </span>
                                {row.timing.breakfast.count === "1" && row.timing.breakfast.mealRelation ? (
                                  <div className="bg-[#D95B2F] text-white rounded-full px-1.5 py-0.5 text-[8px] font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs whitespace-nowrap">
                                    <span>{row.timing.breakfast.mealRelation === "before" ? "Before" : "After"}</span>
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            {/* Lunch */}
                            <td
                              className="text-center"
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "6px 2px",
                                verticalAlign: "middle",
                              }}
                            >
                              <div className="flex flex-col items-center justify-center gap-1 mx-auto">
                                <span className="w-5 h-5 border border-slate-200 rounded text-[10px] font-bold text-[#1E293B] bg-[#FAF9F5] inline-flex items-center justify-center">
                                  {row.timing.lunch.count}
                                </span>
                                {row.timing.lunch.count === "1" && row.timing.lunch.mealRelation ? (
                                  <div className="bg-[#D95B2F] text-white rounded-full px-1.5 py-0.5 text-[8px] font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs whitespace-nowrap">
                                    <span>{row.timing.lunch.mealRelation === "before" ? "Before" : "After"}</span>
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            {/* Dinner */}
                            <td
                              className="text-center"
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "6px 2px",
                                verticalAlign: "middle",
                              }}
                            >
                              <div className="flex flex-col items-center justify-center gap-1 mx-auto">
                                <span className="w-5 h-5 border border-slate-200 rounded text-[10px] font-bold text-[#1E293B] bg-[#FAF9F5] inline-flex items-center justify-center">
                                  {row.timing.dinner.count}
                                </span>
                                {row.timing.dinner.count === "1" && row.timing.dinner.mealRelation ? (
                                  <div className="bg-[#D95B2F] text-white rounded-full px-1.5 py-0.5 text-[8px] font-bold inline-flex items-center justify-center gap-0.5 shadow-2xs whitespace-nowrap">
                                    <span>{row.timing.dinner.mealRelation === "before" ? "Before" : "After"}</span>
                                  </div>
                                ) : null}
                              </div>
                            </td>

                            {/* Duration */}
                            <td
                              className="text-center font-extrabold text-xs text-[#1E293B]"
                              style={{
                                borderRight: "1px solid #DFD9CE",
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "8px 4px",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.duration || "-"} Days
                            </td>

                            {/* Quantity */}
                            <td
                              className="text-center font-bold text-xs text-[#1E293B]"
                              style={{
                                borderBottom: hasNotes ? "1px solid #DFD9CE" : (isLastItem ? "none" : "1px solid #DFD9CE"),
                                padding: "8px 4px",
                                verticalAlign: "middle",
                              }}
                            >
                              {row.quantity || "-"}
                            </td>
                          </tr>

                          {/* Medicine-specific Medical Notes row */}
                          {hasNotes && (
                            <tr key={`${row.id || globalIdx}-medical-notes`} className="bg-[#FAF9F5] break-inside-avoid" style={{ pageBreakInside: "avoid" }}>
                              <td
                                colSpan={8}
                                style={{
                                  borderBottom: isLastItem ? "none" : "1px solid #DFD9CE",
                                  padding: "6px 12px 7px 12px",
                                  textAlign: "left",
                                  backgroundColor: "#FAF9F5",
                                }}
                              >
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#475569] tracking-wider mb-1">
                                  <FileEdit size={11} className="text-[#64748B]" />
                                  <span>Medical Notes</span>
                                </div>
                                <div className="text-[11px] text-[#1E293B] font-medium leading-relaxed space-y-0.5 pl-0.5">
                                  {bulletPoints.map((point, pIdx) => (
                                    <div key={pIdx} className="flex items-start gap-1.5 leading-snug">
                                      <span className="text-[#1E293B] font-bold text-xs leading-none mt-0.5 select-none">•</span>
                                      <span className="break-words">{point}</span>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {/* Doctor Notes & Special Instructions outside the table (Final Page only, if present) */}
              {(() => {
                const hasDoctorNotes = isFinalPage && Boolean(data.doctorNotes && data.doctorNotes.trim());
                if (!hasDoctorNotes) return null;

                return (
                  <div className="mt-3.5 p-3 border border-[#DFD9CE] rounded-lg bg-[#FAF9F5] text-left">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#475569] tracking-wider mb-1.5">
                      <FileEdit size={11} className="text-[#64748B]" />
                      <span>Doctor Notes & Special Instructions</span>
                    </div>

                    <div className="text-[11px] text-[#1E293B] leading-relaxed">
                      <span>{data.doctorNotes?.trim()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Flexible intentional white space */}
            <div className="flex-1 min-h-[16px]" />

            {/* Page Number on bottom-left (Multi-page prescriptions) */}
            {pages.length > 1 && (
              <div className="prescription-page-number absolute left-[9mm] bottom-[10mm] text-[9.5px] font-bold text-slate-400 font-mono tracking-wider select-none z-20">
                Page {pageIndex + 1} of {pages.length}
              </div>
            )}

            {/* DOCTOR SIGNATURE: STRICTLY ON THE FINAL PAGE ONLY */}
            {isFinalPage && (
              <div className="prescription-final-signature absolute right-[9mm] bottom-[10mm] text-right flex flex-col items-end z-20 pointer-events-none">
                <p className="italic text-[22px] text-[#1E293B] select-none tracking-normal leading-tight mb-0.5" style={{ fontFamily: "'DM Sans', sans-serif" }}>
                  P. Murali Krishna
                </p>
                <div className="w-48 sm:w-56 border-t border-slate-300 ml-auto my-1"></div>
                <p className="font-extrabold text-[12px] text-[#1E293B] leading-tight">
                  Dr. P. Murali Krishna
                </p>
                <p className="text-[9.5px] text-[#64748B] font-medium mt-0.5 leading-tight">
                  Consultant Ayurvedic Specialist
                </p>
                <p className="text-[8.5px] text-slate-400 font-mono mt-0.5 leading-tight">
                  Digitally Signed & Timestamped: {format(data.signedAt ? new Date(data.signedAt) : new Date(), "dd-MM-yyyy HH:mm")} IST
                </p>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
