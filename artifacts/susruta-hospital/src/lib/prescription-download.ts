import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { domToCanvas } from "modern-screenshot";
import { jsPDF } from "jspdf";
import { DigitalPrescriptionPages } from "@/components/DigitalPrescriptionPages";

export interface PrintPrescriptionData {
  patientName: string;
  patientCode?: string;
  age?: string | number;
  gender?: string;
  ageGender?: string;
  consultDate: string;
  diagnosis?: string;
  formulationRows?: {
    id: string;
    medicines: { id: string; name: string; dosage: string }[];
    toBeTaken: string;
    timing: {
      morning: { count: string; mealRelation: "before" | "after" | "" };
      afternoon: { count: string; mealRelation: "before" | "after" | "" };
      night: { count: string; mealRelation: "before" | "after" | "" };
    };
    duration: string;
    quantity: string;
    medicalNotes?: string;
    notes?: string;
  }[];
  medicines?: any[];
  doctorNotes?: string;
  signedAt?: string;
}

/**
 * Downloads any remote/local static file (PDF or image) directly to disk via Blob URL.
 * Never opens temporary windows, tabs, viewers, or iframes.
 */
export async function downloadFileDirectly(url: string, defaultName: string): Promise<void> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Failed to download file (HTTP ${res.status})`);
  }

  // Preserve filename from backend's Content-Disposition header if provided
  let filename = defaultName;
  const disposition = res.headers.get("content-disposition");
  if (disposition) {
    const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match && utf8Match[1]) {
      try {
        filename = decodeURIComponent(utf8Match[1].trim());
      } catch {}
    } else {
      const regularMatch = disposition.match(/filename=["']?([^"';]+)["']?/i);
      if (regularMatch && regularMatch[1]) {
        try {
          filename = decodeURIComponent(regularMatch[1].trim());
        } catch {
          filename = regularMatch[1].trim();
        }
      }
    }
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
  }, 1000);
}

/**
 * Captures DigitalPrescriptionPages off-screen using modern-screenshot + jsPDF,
 * guaranteeing: PREVIEW = PRINT = DOWNLOAD (one component, one CSS, one A4 layout).
 */
export async function downloadPrescriptionPdf(data: PrintPrescriptionData, fileName: string) {
  const host = document.createElement("div");
  host.className = "rx-capture";
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: "210mm", pointerEvents: "none" });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(React.createElement(DigitalPrescriptionPages, { data })));
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll("img")).map(i => i.complete ? null : i.decode().catch(() => {})));
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".prescription-print-page"));
    if (!pages.length) throw new Error("No prescription pages rendered");
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    for (let i = 0; i < pages.length; i++) {
      const canvas = await domToCanvas(pages[i], { scale: 2, backgroundColor: "#ffffff" });
      if (i > 0) pdf.addPage("a4", "portrait");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, 210, 297, undefined, "FAST");
    }
    pdf.save(fileName);
  } finally {
    root.unmount();
    host.remove();
  }
}
