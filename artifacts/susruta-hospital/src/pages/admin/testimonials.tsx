import React, { useState, useEffect, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Star, Trash2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
            className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(testimonial.id)}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shadow-sm"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminTestimonials() {
  const [testimonials, setTestimonials] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingTestimonial, setDeletingTestimonial] = useState<any | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState({
    patientName: "", patientLocation: "", content: "", contentTe: "", rating: 5, isPublished: true
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await fetch(`${BASE}/api/testimonials`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setIsAdding(false);
        setForm({ patientName: "", patientLocation: "", content: "", contentTe: "", rating: 5, isPublished: true });
        loadTestimonials();
      }
    } catch (e) {
      console.error("Failed to create testimonial:", e);
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
        setTestimonials(prev => prev.filter(t => t.id !== id));
        setDeletingTestimonial(null);
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
        setTestimonials(prev => prev.map(t => t.id === id ? { ...t, isPublished: !currentStatus } : t));
      }
    } catch (e) {
      console.error("Failed to toggle publish status:", e);
    }
  };

  return (
    <AdminLayout>
      {deletingTestimonial && (
        <DeleteTestimonialModal
          testimonial={deletingTestimonial}
          onClose={() => setDeletingTestimonial(null)}
          onConfirm={confirmDelete}
        />
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-sans font-bold text-foreground">Testimonials</h1>
          <p className="text-muted-foreground">Manage patient reviews shown on the website.</p>
        </div>
        <Button className="bg-[#D95B2F] hover:bg-[#C84F27] text-white" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : 'Add New'}
        </Button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm mb-8 animate-in fade-in slide-in-from-top-4">
          <h2 className="font-bold mb-4">Add Testimonial</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <input required placeholder="Patient Name" className="p-2 border rounded-xl" value={form.patientName} onChange={e=>setForm({...form, patientName: e.target.value})} />
              <input placeholder="Location (Optional)" className="p-2 border rounded-xl" value={form.patientLocation} onChange={e=>setForm({...form, patientLocation: e.target.value})} />
            </div>
            <textarea required placeholder="Content (English)" className="w-full p-2 border rounded-xl resize-none" rows={3} value={form.content} onChange={e=>setForm({...form, content: e.target.value})} />
            <textarea placeholder="Content (Telugu translation - Optional)" className="w-full p-2 border rounded-xl resize-none" rows={3} value={form.contentTe} onChange={e=>setForm({...form, contentTe: e.target.value})} />
            
            <div className="flex items-center gap-4">
              <label className="text-sm font-medium">Rating:</label>
              <select className="p-2 border rounded-xl" value={form.rating} onChange={e=>setForm({...form, rating: Number(e.target.value)})}>
                {[5,4,3,2,1].map(n => <option key={n} value={n}>{n} Stars</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm font-medium ml-4">
                <input type="checkbox" checked={form.isPublished} onChange={e=>setForm({...form, isPublished: e.target.checked})} />
                Publish Immediately
              </label>
            </div>
            
            <Button className="bg-[#D95B2F] hover:bg-[#C84F27] text-white" type="submit" disabled={isSaving}>Save Testimonial</Button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center text-muted-foreground">Loading testimonials…</div>
        ) : testimonials.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground bg-white rounded-2xl border border-border">
            No testimonials found. Click "Add New" to create one.
          </div>
        ) : (
          testimonials.map(t => (
            <div key={t.id} className={`bg-white p-6 rounded-2xl border ${!t.isPublished ? 'border-amber-300 bg-amber-50/30' : 'border-border shadow-sm'}`}>
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold">{t.patientName}</h3>
                  </div>
                  <div className="flex text-amber-500 mt-1">
                    {[...Array(t.rating)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    onClick={() => togglePublish(t.id, t.isPublished)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${
                      t.isPublished
                        ? "border-[#1a3d2b] text-[#1a3d2b] hover:bg-[#1a3d2b]/10"
                        : "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-600"
                    }`}
                  >
                    {t.isPublished ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    onClick={() => setDeletingTestimonial(t)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground/80 mb-2">"{t.content}"</p>
              {t.contentTe && <p className="text-sm text-foreground/60 border-t border-border/50 pt-2 mt-2">"{t.contentTe}"</p>}
            </div>
          ))
        )}
      </div>
    </AdminLayout>
  );
}
