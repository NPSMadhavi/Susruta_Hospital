import React from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useListAppointments } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Users, Calendar as CalendarIcon, Clock } from "lucide-react";

export default function AdminDashboard() {
  const { data: appointments = [], isLoading } = useListAppointments();

  const pending = appointments.filter(a => a.status === 'pending').length;
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground">Welcome to Susruta Hospital Admin Panel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground">Total Appointments</h3>
            <div className="p-2 bg-primary/10 text-primary rounded-lg"><Users size={20}/></div>
          </div>
          <p className="text-4xl font-bold font-serif">{isLoading ? '-' : appointments.length}</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground">Pending Requests</h3>
            <div className="p-2 bg-yellow-500/10 text-yellow-600 rounded-lg"><Clock size={20}/></div>
          </div>
          <p className="text-4xl font-bold font-serif text-yellow-600">{isLoading ? '-' : pending}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground">Confirmed</h3>
            <div className="p-2 bg-green-500/10 text-green-600 rounded-lg"><CalendarIcon size={20}/></div>
          </div>
          <p className="text-4xl font-bold font-serif text-green-600">{isLoading ? '-' : confirmed}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="p-6 border-b border-border flex justify-between items-center">
          <h2 className="font-bold text-lg">Recent Pending Requests</h2>
          <Link href="/admin/appointments" className="text-sm text-primary font-medium hover:underline">View All</Link>
        </div>
        <div className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-4 font-medium">Patient</th>
                  <th className="p-4 font-medium">Date & Time</th>
                  <th className="p-4 font-medium">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {appointments.filter(a => a.status === 'pending').slice(0, 5).map(apt => (
                  <tr key={apt.id} className="hover:bg-muted/30">
                    <td className="p-4 font-medium">{apt.patientName}</td>
                    <td className="p-4">{apt.date} at {apt.timeSlot}</td>
                    <td className="p-4">{apt.patientPhone}</td>
                  </tr>
                ))}
                {pending === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No pending requests.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
