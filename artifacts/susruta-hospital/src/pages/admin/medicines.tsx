import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  Search, Download, Upload, Plus, Pencil, Trash2,
  ChevronLeft, ChevronRight, X, AlertCircle, FileSpreadsheet,
  CheckCircle2, Loader2
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type Medicine = {
  id: number;
  medicineId: string;
  medicineName: string;
  dosage: string | null;
  frequency: string | null;
  formulation: string | null;
  properties: string | null;
  indications: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function AdminMedicines() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [deletingMedicine, setDeletingMedicine] = useState<Medicine | null>(null);

  // Import state
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [form, setForm] = useState({
    medicineName: "",
    dosageAndFrequency: "",
    indications: "",
  });

  // Load medicines from DB
  const loadMedicines = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/medicines`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setMedicines(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load medicines:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMedicines();
  }, [loadMedicines]);

  // Open Add Modal
  const openAddModal = () => {
    setEditingMedicine(null);
    setForm({
      medicineName: "",
      dosageAndFrequency: "",
      indications: "",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (med: Medicine) => {
    setEditingMedicine(med);
    setForm({
      medicineName: med.medicineName || "",
      dosageAndFrequency: [med.dosage, med.frequency].filter(Boolean).join(" ") || med.dosage || "",
      indications: med.indications || "",
    });
    setFormError("");
    setIsModalOpen(true);
  };

  // Save (Create or Update) Medicine
  const handleSaveMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!form.medicineName.trim()) {
      setFormError("Medicine Name is required");
      return;
    }

    if (!form.dosageAndFrequency.trim()) {
      setFormError("Dosage & Frequency is required");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = editingMedicine ? `${BASE}/api/medicines/${editingMedicine.id}` : `${BASE}/api/medicines`;
      const method = editingMedicine ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicineName: form.medicineName.trim(),
          dosageAndFrequency: form.dosageAndFrequency.trim(),
          indications: form.indications.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || "Failed to save medicine");
      }

      setIsModalOpen(false);
      await loadMedicines();
    } catch (err: any) {
      setFormError(err.message || "Something went wrong while saving medicine");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Medicine
  const handleDeleteMedicine = async () => {
    if (!deletingMedicine) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`${BASE}/api/medicines/${deletingMedicine.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Failed to delete medicine");
      }

      setDeletingMedicine(null);
      await loadMedicines();
    } catch (err: any) {
      console.error("Delete failed:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Search filtering
  const filteredMedicines = useMemo(() => {
    if (!searchQuery.trim()) return medicines;
    const q = searchQuery.toLowerCase().trim();
    return medicines.filter((m) =>
      (m.medicineName && m.medicineName.toLowerCase().includes(q)) ||
      (m.dosage && m.dosage.toLowerCase().includes(q)) ||
      (m.frequency && m.frequency.toLowerCase().includes(q)) ||
      (m.indications && m.indications.toLowerCase().includes(q)) ||
      (m.formulation && m.formulation.toLowerCase().includes(q)) ||
      (m.properties && m.properties.toLowerCase().includes(q))
    );
  }, [medicines, searchQuery]);

  // Pagination logic
  const totalItems = filteredMedicines.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPageClamped = Math.min(currentPage, totalPages);
  const startIndex = totalItems === 0 ? 0 : (currentPageClamped - 1) * pageSize + 1;
  const endIndex = Math.min(totalItems, currentPageClamped * pageSize);
  const paginatedMedicines = useMemo(() => {
    const start = (currentPageClamped - 1) * pageSize;
    return filteredMedicines.slice(start, start + pageSize);
  }, [filteredMedicines, currentPageClamped, pageSize]);

  // Export CSV
  const exportCSV = () => {
    if (medicines.length === 0) return;
    const headers = ["Medicine Name", "Dosage & Frequency", "Indications"];
    const rows = medicines.map((m) => [
      `"${(m.medicineName || "").replace(/"/g, '""')}"`,
      `"${([m.dosage, m.frequency].filter(Boolean).join(" ") || "").replace(/"/g, '""')}"`,
      `"${(m.indications || "").replace(/"/g, '""')}"`,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `medicines_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export PDF / Print
  const exportPDF = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const rowsHtml = medicines.map(m => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold;">${m.medicineName || ""}</td>
        <td style="padding:8px;border:1px solid #ddd;">${[m.dosage, m.frequency].filter(Boolean).join(" ")}</td>
        <td style="padding:8px;border:1px solid #ddd;">${m.indications || "-"}</td>
      </tr>
    `).join("");

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Medicines Inventory - Susruta Hospital</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #1B3227; }
          h1 { color: #1B3227; font-size: 20px; margin-bottom: 5px; }
          p { color: #666; font-size: 12px; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th { background: #F8F9FA; text-align: left; padding: 10px; border: 1px solid #ddd; }
        </style>
      </head>
      <body>
        <h1>Susruta Hospital — Medicines List</h1>
        <p>Generated on ${new Date().toLocaleDateString("en-IN")} • Total Medicines: ${medicines.length}</p>
        <table>
          <thead>
            <tr>
              <th>Medicine Name</th>
              <th>Dosage & Frequency</th>
              <th>Indications</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  // Download Sample CSV Template
  const downloadSampleCSV = () => {
    const headers = ["Medicine Name", "Dosage & Frequency", "Indications"];
    const sampleRows = [
      ["Haritaki Churna", "3–6 gm, thrice daily", "Constipation, indigestion, bloating, digestive irregularity"],
      ["Talishadya Churna", "2–4 gm, twice daily", "Cough, respiratory congestion, indigestion, loss of appetite"],
      ["Trikatu Churna", "1–2 gm, twice daily", "Indigestion, low appetite, bloating, sluggish digestion"],
      ["Sitopaladi Churna", "2–3 gm, twice or thrice daily", "Cough, throat irritation, cold, respiratory discomfort"],
      ["Triphala Churna", "3–6 gm, once daily at bedtime", "Constipation, sluggish digestion, bowel irregularity"],
      ["Ashvagandha Churna", "3–6 gm, 1–2 times daily", "General weakness, fatigue, stress, poor sleep, debility"],
    ];
    const csvContent = "data:text/csv;charset=utf-8," + [
      headers.join(","),
      ...sampleRows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "medicines_sample_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const parseCSVContent = (text: string) => {
    const lines = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      throw new Error("The CSV file is empty or does not contain data rows.");
    }

    const parseLine = (line: string): string[] => {
      const result: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          if (inQuotes && line[i + 1] === char) {
            cur += char;
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === "," && !inQuotes) {
          result.push(cur.trim());
          cur = "";
        } else {
          cur += char;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const rawHeaders = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    let nameIdx = rawHeaders.findIndex((h) => h.includes("medicinename") || h.includes("name") || h.includes("medicine"));
    let dosageIdx = rawHeaders.findIndex((h) => h.includes("dosage") || h.includes("frequency") || h.includes("dose"));
    let indicationsIdx = rawHeaders.findIndex((h) => h.includes("indication"));

    if (nameIdx === -1) nameIdx = 0;
    if (dosageIdx === -1) dosageIdx = 1;
    if (indicationsIdx === -1) indicationsIdx = 2;

    const list: Array<{ medicineName: string; dosageAndFrequency: string; indications: string }> = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = parseLine(lines[i]);
      const name = cells[nameIdx] || "";
      const dosage = cells[dosageIdx] || "";
      const indications = cells[indicationsIdx] || "";

      if (name.trim()) {
        list.push({
          medicineName: name.trim(),
          dosageAndFrequency: dosage.trim() || "-",
          indications: indications.trim(),
        });
      }
    }

    if (list.length === 0) {
      throw new Error("No valid medicines found in the file. Please ensure at least 'Medicine Name' is filled.");
    }

    return list;
  };

  const handleDirectFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so selecting the same file again triggers onChange
    e.target.value = "";

    setImportError("");
    setImportSuccessMessage("");
    setIsImporting(true);

    try {
      const text = await file.text();
      let meds: Array<{ medicineName: string; dosageAndFrequency: string; indications: string }> = [];

      if (file.name.endsWith(".json")) {
        const json = JSON.parse(text);
        const rawList = Array.isArray(json) ? json : (Array.isArray(json.medicines) ? json.medicines : []);
        meds = rawList.map((m: any) => ({
          medicineName: (m.medicineName || m.name || "").trim(),
          dosageAndFrequency: (m.dosageAndFrequency || m.dosage || "").trim() || "-",
          indications: (m.indications || "").trim(),
        })).filter((m: any) => m.medicineName);
        if (meds.length === 0) {
          throw new Error("No valid medicines found in JSON. Format as [{ medicineName, dosageAndFrequency, indications }].");
        }
      } else {
        meds = parseCSVContent(text);
      }

      if (meds.length === 0) {
        throw new Error("No valid medicines found in the file. Please ensure at least 'Medicine Name' is filled.");
      }

      const res = await fetch(`${BASE}/api/medicines/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicines: meds }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to import medicines to the database.");
      }

      const resData = await res.json();
      await loadMedicines();
      setImportSuccessMessage(`Successfully imported ${resData.count || meds.length} medicine${(resData.count || meds.length) === 1 ? "" : "s"} from ${file.name}!`);
      setTimeout(() => setImportSuccessMessage(""), 6000);
    } catch (err: any) {
      setImportError(err.message || "Failed to import file. Please check file format.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ── TOP HEADER ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-[#1B3227] tracking-tight">Medicines</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Small Search Bar directly to the left side of Import button */}
            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8E938B]" size={14} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search medicines..."
                className="w-full pl-8 pr-7 py-2 bg-white border border-[#EDEFEB] text-[#1B3227] placeholder-[#8E938B] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] shadow-sm transition-all h-[38px]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8E938B] hover:text-[#1B3227] cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Hidden native file input opened directly by the Import button */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.json,application/json"
              onChange={handleDirectFileImport}
              className="hidden"
            />

            <button
              type="button"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2.5 bg-white border border-[#EDEFEB] text-[#42493E] hover:bg-gray-50 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
              title="Import medicines from file"
            >
              {isImporting ? <Loader2 size={15} className="animate-spin text-[#D95B2F]" /> : <Upload size={15} />}
              <span>{isImporting ? "Importing..." : "Import"}</span>
            </button>

            <button
              onClick={exportCSV}
              className="px-4 py-2.5 bg-white border border-[#EDEFEB] text-[#42493E] hover:bg-gray-50 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              title="Export"
            >
              <Download size={15} />
              <span>Export</span>
            </button>

            {/* + Add New Medicine button shows ONLY when at least 1 medicine exists in DB */}
            {medicines.length > 0 && (
              <button
                onClick={openAddModal}
                className="px-4 py-2.5 bg-[#D95B2F] hover:bg-[#C84A1F] text-white text-xs font-bold rounded-xl flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <Plus size={16} />
                <span>Add New Medicine</span>
              </button>
            )}
          </div>
        </div>

        {/* ── IMPORT SUCCESS MESSAGE BANNER ────────────────────── */}
        {importSuccessMessage && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              <span>{importSuccessMessage}</span>
            </div>
            <button
              onClick={() => setImportSuccessMessage("")}
              className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* ── IMPORT ERROR MESSAGE BANNER ──────────────────────── */}
        {importError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-800 text-xs flex items-center justify-between shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5">
              <AlertCircle size={16} className="text-red-600 shrink-0" />
              <div>
                <span className="font-bold">Import Failed: </span>
                <span>{importError}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={downloadSampleCSV}
                className="text-xs font-bold text-[#D95B2F] hover:underline cursor-pointer flex items-center gap-1"
              >
                <Download size={12} />
                <span>Sample CSV</span>
              </button>
              <button
                onClick={() => setImportError("")}
                className="text-red-500 hover:text-red-700 cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        )}

        {/* ── TOTAL MEDICINES STAT CARD (when medicines exist or loading) ────────────────── */}
        {medicines.length > 0 && (
          <div className="bg-white rounded-2xl border border-[#EDEFEB] p-4 w-full sm:w-48 shadow-sm">
            <p className="text-sm font-bold text-[#8E938B] tracking-wider mb-1">
              Total Medicines
            </p>
            <p className="text-2xl font-extrabold text-[#1B3227]">
              {medicines.length}
            </p>
          </div>
        )}

        {/* ── MEDICINES TABLE / EMPTY STATE ─────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              Loading medicines persistence data...
            </div>
          ) : medicines.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center my-4">
              <button
                onClick={openAddModal}
                className="w-14 h-14 bg-[#FEF3ED] text-[#D95B2F] hover:bg-[#FDBA74]/30 rounded-2xl flex items-center justify-center transition-all mb-4 shadow-sm"
              >
                <Plus size={28} />
              </button>
              <h3 className="text-base font-bold text-[#1B3227] mb-1">
                No medicines added yet
              </h3>
              <p className="text-xs text-muted-foreground max-w-md leading-relaxed mb-5">
                Click the button below to add Ayurvedic formulations to this prescription.
              </p>
              
            </div>
          ) : filteredMedicines.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No matching medicines found for "{searchQuery}".
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs md:text-sm">
                  <thead>
                    <tr className="bg-[#F8F9FA] border-b border-[#EDEFEB] text-[#8E938B] font-semibold text-[13px] tracking-wider">
                      <th className="py-3.5 px-6">Medicine Name</th>
                      <th className="py-3.5 px-6">Dosage & Frequency</th>
                      <th className="py-3.5 px-6">Indications</th>
                      <th className="py-3.5 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EDEFEB]">
                    {paginatedMedicines.map((med) => {
                      const dosageAndFreq = [med.dosage, med.frequency].filter(Boolean).join(" ") || "-";
                      return (
                        <tr key={med.id} className="hover:bg-[#F8F9FA]/60 transition-colors">
                          <td className="py-4 px-6 font-semibold text-[#1B3227]">
                            <p className="text-sm text-[#1B3227]">{med.medicineName}</p>
                          </td>
                          <td className="py-4 px-6 font-medium text-[#42493E]">
                            {dosageAndFreq}
                          </td>
                          <td className="py-4 px-6 font-medium text-[#42493E]">
                            {med.indications || "-"}
                          </td>
                          <td className="py-4 px-6 text-right space-x-2">
                            <button
                              onClick={() => openEditModal(med)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#F3CDBB] text-[#D95B2F] hover:bg-[#FEF3ED] rounded-lg text-xs font-semibold transition-colors"
                            >
                              <Pencil size={13} />
                              <span>Edit</span>
                            </button>

                            <button
                              onClick={() => setDeletingMedicine(med)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#FCA5A5] text-[#DC2626] hover:bg-[#FEF2F2] rounded-lg text-xs font-semibold transition-colors"
                            >
                              <Trash2 size={13} />
                              <span>Delete</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ── PAGINATION BAR ─────────────────────────── */}
              <div className="px-6 py-4 border-t border-[#EDEFEB] bg-[#F8F9FA]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-4">
                  <span>
                    Showing <strong className="text-foreground">{startIndex}</strong> to{" "}
                    <strong className="text-foreground">{endIndex}</strong> of{" "}
                    <strong className="text-foreground">{totalItems}</strong> items
                  </span>

                  <div className="flex items-center gap-2 border-l border-[#EDEFEB] pl-4">
                    <span>Rows per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-white border border-[#EDEFEB] rounded-lg px-2 py-1 text-xs font-medium focus:outline-none"
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={currentPageClamped <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-[#EDEFEB] bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <ChevronLeft size={14} />
                    <span>Previous</span>
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPageClamped) <= 1)
                    .map((p, idx, arr) => {
                      const prev = arr[idx - 1];
                      const showEllipsis = prev && p - prev > 1;
                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="px-1 text-muted-foreground">...</span>}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className={`min-w-[28px] h-[28px] rounded-lg text-xs font-bold transition-all ${
                              currentPageClamped === p
                                ? "bg-[#D95B2F] text-white"
                                : "bg-white border border-[#EDEFEB] text-foreground hover:bg-gray-50"
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      );
                    })}

                  <button
                    disabled={currentPageClamped >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1.5 rounded-lg border border-[#EDEFEB] bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── ADD / EDIT MEDICINE FORM MODAL (MATCHING REFERENCE DESIGN EXACTLY) ── */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-2xl w-full max-w-2xl overflow-hidden">
            
            {/* Header */}
            <div className="px-7 py-5 border-b border-[#EDEFEB]">
              <h3 className="text-lg font-bold text-[#1F2937] tracking-tight mb-1">
                General & Formulation Information
              </h3>
              <p className="text-xs text-[#64748B]">
                Enter the basic classification, botanical names, and formulation type.
              </p>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSaveMedicine}>
              <div className="px-7 py-6 space-y-5">
                {formError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                {/* Field 1: Medicine Name */}
                <div>
                  <label className="block text-xs font-bold text-[#334155] mb-2">
                    Medicine Name
                  </label>
                  <input
                    type="text"
                    required
                    value={form.medicineName}
                    onChange={(e) => setForm({ ...form, medicineName: e.target.value })}
                    placeholder="e.g., Chandraprabha Vati"
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#0F172A] placeholder-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                  />
                </div>

                {/* Field 2: Dosage & Frequency */}
                <div>
                  <label className="block text-xs font-bold text-[#334155] mb-2">
                    Dosage & Frequency
                  </label>
                  <input
                    type="text"
                    required
                    value={form.dosageAndFrequency}
                    onChange={(e) => setForm({ ...form, dosageAndFrequency: e.target.value })}
                    placeholder="e.g., 3–6 gm, 1–2 times daily"
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#0F172A] placeholder-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                  />
                </div>

                {/* Field 3: Indications */}
                <div>
                  <label className="block text-xs font-bold text-[#334155] mb-2">
                    Indications
                  </label>
                  <input
                    type="text"
                    value={form.indications}
                    onChange={(e) => setForm({ ...form, indications: e.target.value })}
                    placeholder="e.g., General debility, stress, fatigue, immunity"
                    className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] text-sm text-[#0F172A] placeholder-[#94A3B8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F] transition-all"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-7 py-4 border-t border-[#EDEFEB] bg-[#F8FAFC] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl border border-[#CBD5E1] bg-white hover:bg-gray-50 text-xs font-bold text-[#475569] transition-all shadow-sm"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-2.5 rounded-xl bg-[#D95B2F] hover:bg-[#C84A1F] text-white text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : "Save"}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ── DELETE CONFIRMATION MODAL ─────────────────────────── */}
      {deletingMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden p-6">
            <div className="flex items-center gap-3 text-red-600 mb-3">
              <div className="p-3 bg-red-100 rounded-2xl">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="font-bold text-base text-foreground">Delete Medicine</h3>
                <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed my-4">
              Are you sure you want to delete medicine{" "}
              <span className="font-bold text-foreground">{deletingMedicine.medicineName}</span>?
            </p>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setDeletingMedicine(null)}
                className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteMedicine}
                disabled={isSubmitting}
                className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm disabled:opacity-50"
              >
                {isSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

    </AdminLayout>
  );
}
