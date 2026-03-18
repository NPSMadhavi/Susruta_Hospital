import React, { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useListTestimonials, useCreateTestimonial, useDeleteTestimonial, useUpdateTestimonial } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";

export default function AdminTestimonials() {
  const queryClient = useQueryClient();
  const { data: testimonials = [], isLoading } = useListTestimonials();
  
  const createMut = useCreateTestimonial();
  const deleteMut = useDeleteTestimonial();
  const updateMut = useUpdateTestimonial();

  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    patientName: "", patientLocation: "", content: "", contentTe: "", rating: 5, isPublished: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMut.mutate({ data: form }, {
      onSuccess: () => {
        setIsAdding(false);
        setForm({ patientName: "", patientLocation: "", content: "", contentTe: "", rating: 5, isPublished: true });
        queryClient.invalidateQueries({ queryKey: ['/api/testimonials'] });
      }
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Delete this testimonial?")) {
      deleteMut.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/testimonials'] })
      });
    }
  };

  const togglePublish = (id: number, currentStatus: boolean) => {
    updateMut.mutate({ id, data: { isPublished: !currentStatus } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/testimonials'] })
    });
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-foreground">Testimonials</h1>
          <p className="text-muted-foreground">Manage patient reviews shown on the website.</p>
        </div>
        <Button onClick={() => setIsAdding(!isAdding)}>{isAdding ? 'Cancel' : 'Add New'}</Button>
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
            
            <Button type="submit" disabled={createMut.isPending}>Save Testimonial</Button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {isLoading ? "Loading..." : testimonials.map(t => (
          <div key={t.id} className={`bg-white p-6 rounded-2xl border ${!t.isPublished ? 'border-dashed border-muted-foreground opacity-70' : 'border-border shadow-sm'}`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold">{t.patientName}</h3>
                <div className="flex text-accent mt-1">
                  {[...Array(t.rating)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant={t.isPublished ? "outline" : "secondary"} onClick={() => togglePublish(t.id, t.isPublished)}>
                  {t.isPublished ? 'Unpublish' : 'Publish'}
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive h-8" onClick={() => handleDelete(t.id)}>Delete</Button>
              </div>
            </div>
            <p className="text-sm text-foreground/80 mb-2">"{t.content}"</p>
            {t.contentTe && <p className="text-sm text-foreground/60 border-t border-border/50 pt-2 mt-2">"{t.contentTe}"</p>}
          </div>
        ))}
      </div>
    </AdminLayout>
  );
}
