import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Star, Trash2, Edit2, Search, ChevronLeft, ChevronRight,
  CheckCircle2, EyeOff, Loader2, X, Plus, MessageSquareQuote,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const PAGE_SIZE = 10;

function DeleteTestimonialModal({
  testimonial,
  onClose,
  onConfirm,
}: {
  testimonial: any;
  onClose: () => void;
  onConfirm: (id: number) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-border shadow-2xl w-full max-w-sm overflow-hidden p-6">
        <div className="flex items-center gap-3 text-red-600 mb-3">
          <div className="p-3 bg-red-100 rounded-2xl">
            <Trash2 size={22} />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground">Delete Testimonial</h3>
            <p className="text-xs text-muted-foreground">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed my-4">
          Are you sure you want to delete the testimonial from{" "}
          <span className="font-bold text-foreground">{testimonial.patientName}</span>?
        </p>

        <div className="flex gap-2 justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(testimonial.id)}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  if (currentPage > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);
  return pages;
}

type TestimonialForm = {
  patientName: string;
  patientLocation: string;
  content: string;
  contentTe: string;
  rating: number;
  isPublished: boolean;
};

const defaultForm: TestimonialForm = {
  patientName: "",
  patientLocation: "",
  content: "",
  contentTe: "",
  rating: 5,
  isPublished: true,
};

export default function AdminTestimonials() {
  const queryClient = useQueryClient();
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingTestimonial, setDeletingTestimonial] = useState<any | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<TestimonialForm>(defaultForm);

  // Search & Filter & Pagination states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "unpublished">("all");
  const [currentPage, setCurrentPage] = useState(1);

  const loadTestimonials = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${BASE}/api/testimonials/all`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setTestimonials(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to load testimonials:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTestimonials();
  }, [loadTestimonials]);

  const cancelForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  const startEdit = (t: any) => {
    setEditingId(t.id);
    setForm({
      patientName: t.patientName || "",
      patientLocation: t.patientLocation || "",
      content: t.content || "",
      contentTe: t.contentTe || "",
      rating: Number(t.rating) || 5,
      isPublished: Boolean(t.isPublished),
    });
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const url = editingId ? `${BASE}/api/testimonials/${editingId}` : `${BASE}/api/testimonials`;
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        cancelForm();
        await loadTestimonials();
        await queryClient.invalidateQueries({ queryKey: ["/api/testimonials"] });
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Failed to save testimonial.");
      }
    } catch (e) {
      console.error("Failed to save testimonial:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDelete = async (id: number) => {
    try {
      const res = await fetch(`${BASE}/api/testimonials/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setTestimonials((prev) => prev.filter((t) => t.id !== id));
        setDeletingTestimonial(null);
        await queryClient.invalidateQueries({ queryKey: ["/api/testimonials"] });
      }
    } catch (e) {
      console.error("Failed to delete testimonial:", e);
    }
  };

  const togglePublish = async (id: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`${BASE}/api/testimonials/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublished: !currentStatus }),
      });
      if (res.ok) {
        setTestimonials((prev) =>
          prev.map((t) => (t.id === id ? { ...t, isPublished: !currentStatus } : t))
        );
        await queryClient.invalidateQueries({ queryKey: ["/api/testimonials"] });
      }
    } catch (e) {
      console.error("Failed to toggle publish status:", e);
    }
  };

  // Stats
  const publishedCount = useMemo(
    () => testimonials.filter((t) => t.isPublished).length,
    [testimonials]
  );
  const unpublishedCount = testimonials.length - publishedCount;

  // Filtered testimonials
  const filteredTestimonials = useMemo(() => {
    return testimonials.filter((t) => {
      if (statusFilter === "published" && !t.isPublished) return false;
      if (statusFilter === "unpublished" && t.isPublished) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = t.patientName?.toLowerCase().includes(q);
        const matchLoc = t.patientLocation?.toLowerCase().includes(q);
        const matchContent = t.content?.toLowerCase().includes(q);
        const matchTe = t.contentTe?.toLowerCase().includes(q);
        if (!matchName && !matchLoc && !matchContent && !matchTe) return false;
      }
      return true;
    });
  }, [testimonials, searchQuery, statusFilter]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // Pagination calculations (10 items per page)
  const totalItems = filteredTestimonials.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const currentPageClamped = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = totalItems === 0 ? 0 : (currentPageClamped - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalItems);
  const paginatedTestimonials = filteredTestimonials.slice(
    startIndex,
    startIndex + PAGE_SIZE
  );

  return (
    <AdminLayout>
      {deletingTestimonial && (
        <DeleteTestimonialModal
          testimonial={deletingTestimonial}
          onClose={() => setDeletingTestimonial(null)}
          onConfirm={confirmDelete}
        />
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-sans font-bold text-foreground">Testimonials</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage patient reviews shown on the website.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={loadTestimonials}
            disabled={isLoading}
            className="p-2.5 rounded-xl border border-border text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors disabled:opacity-50"
            title="Refresh testimonials"
          >
            <RefreshCw size={15} className={isLoading ? "animate-spin text-[#D95B2F]" : ""} />
          </button>
          <Button
            className="bg-[#D95B2F] hover:bg-[#C84F27] text-white flex items-center gap-1.5 shadow-sm"
            onClick={() => {
              if (isAdding) {
                cancelForm();
              } else {
                setEditingId(null);
                setForm(defaultForm);
                setIsAdding(true);
              }
            }}
          >
            {isAdding ? (
              <>
                <X size={15} /> Cancel
              </>
            ) : (
              <>
                <Plus size={15} /> Add New
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Add / Edit Form Card */}
      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm mb-6 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div>
              <h2 className="font-bold text-base text-foreground">
                {editingId ? `Edit Testimonial (#${editingId})` : "Add Testimonial"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {editingId
                  ? "Update the details and translation for this review."
                  : "Add a new patient experience to be shown in the reviews section."}
              </p>
            </div>
            <button
              type="button"
              onClick={cancelForm}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Patient Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  placeholder="e.g. Sahu Pavan"
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]"
                  value={form.patientName}
                  onChange={(e) => setForm({ ...form, patientName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">
                  Location or Department <span className="text-muted-foreground font-normal">(Optional)</span>
                </label>
                <input
                  placeholder="e.g. Tirupati or Joint & Arthritis Care"
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]"
                  value={form.patientLocation}
                  onChange={(e) => setForm({ ...form, patientLocation: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Review Content (English) <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                placeholder="Write the patient's review..."
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]"
                rows={3}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground mb-1.5">
                Review Content (Telugu Translation) <span className="text-muted-foreground font-normal">(Optional)</span>
              </label>
              <textarea
                placeholder="రోగి అనుభవం తెలుగులో..."
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b]"
                rows={3}
                value={form.contentTe}
                onChange={(e) => setForm({ ...form, contentTe: e.target.value })}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-foreground">Rating:</label>
                  <select
                    className="px-3 py-1.5 border border-border rounded-xl text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20"
                    value={form.rating}
                    onChange={(e) => setForm({ ...form, rating: Number(e.target.value) })}
                  >
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option key={n} value={n}>
                        {n} Stars {"★".repeat(n)}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded text-[#1a3d2b] focus:ring-[#1a3d2b]"
                    checked={form.isPublished}
                    onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
                  />
                  <span>Publish Immediately</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 border border-border text-xs font-semibold rounded-xl text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <Button
                  className="bg-[#D95B2F] hover:bg-[#C84F27] text-white shadow-sm text-xs font-bold px-5"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 size={14} className="animate-spin mr-1.5" /> Saving…
                    </>
                  ) : editingId ? (
                    "Update Testimonial"
                  ) : (
                    "Save Testimonial"
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search patient, location, or review..."
            className="w-full pl-10 pr-9 py-2.5 border border-border rounded-xl text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3d2b]/20 focus:border-[#1a3d2b] transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
              title="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              statusFilter === "all"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            All ({testimonials.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("published")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              statusFilter === "published"
                ? "bg-white text-emerald-700 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Published ({publishedCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("unpublished")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              statusFilter === "unpublished"
                ? "bg-white text-amber-700 shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Unpublished ({unpublishedCount})
          </button>
        </div>
      </div>

      {/* Testimonials List / Table View */}
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground flex items-center justify-center gap-2 shadow-sm">
          <Loader2 size={18} className="animate-spin text-[#D95B2F]" />
          <span className="text-sm font-medium">Loading testimonials…</span>
        </div>
      ) : totalItems === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-12 text-center text-muted-foreground shadow-sm">
          <MessageSquareQuote size={40} className="mx-auto mb-3 opacity-25" />
          <p className="font-semibold text-base text-foreground">
            {searchQuery || statusFilter !== "all"
              ? "No testimonials match your filter"
              : "No testimonials found"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {searchQuery || statusFilter !== "all"
              ? "Try adjusting your search terms or filter selection."
              : 'Click "Add New" above to add the first patient testimonial.'}
          </p>
          {(searchQuery || statusFilter !== "all") && (
            <button
              onClick={() => {
                setSearchQuery("");
                setStatusFilter("all");
              }}
              className="mt-4 px-4 py-2 text-xs font-bold text-[#D95B2F] border border-[#D95B2F]/30 rounded-xl hover:bg-[#D95B2F]/5 transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-14 text-center">
                    #
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider min-w-[200px]">
                    Patient
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-36">
                    Rating
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider min-w-[320px]">
                    Review Content
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-32 text-center">
                    Status
                  </th>
                  <th className="px-5 py-3.5 font-semibold text-muted-foreground text-xs uppercase tracking-wider w-44 text-right pr-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paginatedTestimonials.map((t, idx) => {
                  const rowNum = startIndex + idx + 1;
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "transition-colors hover:bg-muted/20",
                        !t.isPublished && "bg-amber-50/20"
                      )}
                    >
                      {/* Row Index */}
                      <td className="px-5 py-4 text-center text-xs text-muted-foreground font-mono">
                        {rowNum}
                      </td>

                      {/* Patient Name & Location */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#1a3d2b]/10 text-[#1a3d2b] font-bold text-sm flex items-center justify-center shrink-0">
                            {t.patientName ? t.patientName.trim().charAt(0).toUpperCase() : "P"}
                          </div>
                          <div>
                            <p className="font-bold text-foreground text-sm leading-snug">
                              {t.patientName}
                            </p>
                            {t.patientLocation ? (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t.patientLocation}
                              </p>
                            ) : (
                              <span className="text-[11px] text-muted-foreground/50">—</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Rating Stars */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          <div className="flex text-amber-500">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                size={14}
                                className={
                                  i < (t.rating || 5)
                                    ? "fill-amber-400 text-amber-500"
                                    : "fill-gray-200 text-gray-300"
                                }
                              />
                            ))}
                          </div>
                          <span className="text-xs font-semibold text-amber-700 ml-0.5 font-mono">
                            {t.rating || 5}.0
                          </span>
                        </div>
                      </td>

                      {/* Review Content */}
                      <td className="px-5 py-4">
                        <p className="text-sm text-foreground/90 leading-relaxed max-w-xl">
                          "{t.content}"
                        </p>
                        {t.contentTe && (
                          <p className="text-xs text-muted-foreground mt-1.5 pl-2.5 border-l-2 border-[#1a3d2b]/30 italic">
                            <span className="font-semibold not-italic text-[10px] uppercase text-[#1a3d2b] mr-1">
                              TE:
                            </span>
                            "{t.contentTe}"
                          </p>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4 text-center">
                        {t.isPublished ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            Published
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Unpublished
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 text-right pr-6">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => togglePublish(t.id, t.isPublished)}
                            className={cn(
                              "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
                              t.isPublished
                                ? "border-border text-foreground hover:bg-muted"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white border-transparent shadow-sm"
                            )}
                          >
                            {t.isPublished ? "Unpublish" : "Publish"}
                          </button>
                          <button
                            type="button"
                            onClick={() => startEdit(t)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            title="Edit review"
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingTestimonial(t)}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete review"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar (10 items per page) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-border bg-white text-xs text-muted-foreground">
            <div>
              Showing <strong className="font-semibold text-foreground">{totalItems === 0 ? 0 : startIndex + 1}</strong> to{" "}
              <strong className="font-semibold text-foreground">{endIndex}</strong> of{" "}
              <strong className="font-semibold text-foreground">{totalItems}</strong> {totalItems === 1 ? "testimonial" : "testimonials"}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPageClamped <= 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-white text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm cursor-pointer"
                title="Previous Page"
              >
                <ChevronLeft size={14} />
                <span>Previous</span>
              </button>

              <div className="flex items-center gap-1">
                {getPageNumbers(currentPageClamped, totalPages).map((p, idx) => {
                  if (p === "ellipsis") {
                    return (
                      <span
                        key={`ellipsis-${idx}`}
                        className="w-8 h-8 flex items-center justify-center text-muted-foreground"
                      >
                        …
                      </span>
                    );
                  }
                  const isActive = p === currentPageClamped;
                  return (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => setCurrentPage(p)}
                      className={cn(
                        "min-w-[32px] h-8 px-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer",
                        isActive
                          ? "bg-[#D95B2F] text-white shadow-sm"
                          : "border border-border bg-white text-foreground hover:bg-muted"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPageClamped >= totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-white text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm cursor-pointer"
                title="Next Page"
              >
                <span>Next</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
