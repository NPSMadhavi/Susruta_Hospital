import React, { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useGetSettings, useUpdateSettings } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const updateMut = useUpdateSettings();

  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  if (isLoading) return <AdminLayout><div>Loading...</div></AdminLayout>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMut.mutate({ data: form }, {
      onSuccess: () => {
        alert("Settings saved successfully!");
        queryClient.invalidateQueries({ queryKey: ['/api/admin/settings'] });
      }
    });
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Global Settings</h1>
        <p className="text-muted-foreground">Manage website features and contact information.</p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-8">
        
        {/* Features */}
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm space-y-4">
          <h2 className="font-bold text-lg mb-4 border-b border-border pb-2">Website Features</h2>
          
          <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
            <input 
              type="checkbox" 
              className="w-5 h-5 accent-primary"
              checked={form.appointmentBookingEnabled || false}
              onChange={e => setForm({...form, appointmentBookingEnabled: e.target.checked})}
            />
            <div>
              <div className="font-bold">Enable Online Booking</div>
              <div className="text-sm text-muted-foreground">If disabled, the booking form will be hidden and patients will be asked to call.</div>
            </div>
          </label>

          <label className="flex items-center gap-4 cursor-pointer p-4 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
            <input 
              type="checkbox" 
              className="w-5 h-5 accent-primary"
              checked={form.testimonialsEnabled || false}
              onChange={e => setForm({...form, testimonialsEnabled: e.target.checked})}
            />
            <div>
              <div className="font-bold">Show Testimonials Section</div>
              <div className="text-sm text-muted-foreground">Display patient reviews on the public website.</div>
            </div>
          </label>
        </div>

        {/* Contact Info */}
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm space-y-4">
          <h2 className="font-bold text-lg mb-4 border-b border-border pb-2">Contact Information</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Primary Phone</label>
              <input className="w-full p-2 border rounded-xl" value={form.clinicPhone1 || ''} onChange={e=>setForm({...form, clinicPhone1: e.target.value})} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Secondary Phone</label>
              <input className="w-full p-2 border rounded-xl" value={form.clinicPhone2 || ''} onChange={e=>setForm({...form, clinicPhone2: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Email</label>
              <input type="email" className="w-full p-2 border rounded-xl" value={form.clinicEmail || ''} onChange={e=>setForm({...form, clinicEmail: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Working Hours (Text)</label>
              <input className="w-full p-2 border rounded-xl" value={form.workingHours || ''} onChange={e=>setForm({...form, workingHours: e.target.value})} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Physical Address</label>
              <textarea className="w-full p-2 border rounded-xl resize-none" rows={3} value={form.clinicAddress || ''} onChange={e=>setForm({...form, clinicAddress: e.target.value})} />
            </div>
          </div>
        </div>

        <Button type="submit" size="lg" disabled={updateMut.isPending}>
          {updateMut.isPending ? "Saving..." : "Save Settings"}
        </Button>
      </form>
    </AdminLayout>
  );
}
