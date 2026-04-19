import React, { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useListAppointments } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Users, Calendar as CalendarIcon, Clock, Video, ArrowRight } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminDashboard() {
  const { data: appointments = [], isLoading } = useListAppointments();
  const [onlineAppts, setOnlineAppts] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${BASE}/api/online-appointments/admin`, { credentials: "include" })
      .then(r => r.ok ? r.json() : [])
      .then(data => setOnlineAppts(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const pending = appointments.filter(a => a.status === 'pending').length;
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;
  const liveOnline = onlineAppts.filter(a => a.joinEnabled).length;
  const pendingOnline = onlineAppts.filter(a => a.status === 'pending').length;

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground">Welcome to Susruta Hospital Admin Panel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Total In-Person</h3>
            <div className="p-2 bg-primary/10 text-primary rounded-lg"><Users size={18}/></div>
          </div>
          <p className="text-4xl font-bold font-serif">{isLoading ? '-' : appointments.length}</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Pending In-Person</h3>
            <div className="p-2 bg-yellow-500/10 text-yellow-600 rounded-lg"><Clock size={18}/></div>
          </div>
          <p className="text-4xl font-bold font-serif text-yellow-600">{isLoading ? '-' : pending}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Confirmed In-Person</h3>
            <div className="p-2 bg-green-500/10 text-green-600 rounded-lg"><CalendarIcon size={18}/></div>
          </div>
          <p className="text-4xl font-bold font-serif text-green-600">{isLoading ? '-' : confirmed}</p>
        </div>

        {/* Video Consultations quick link */}
        <Link href="/admin/online-appointments">
          <div className={`p-6 rounded-2xl border-2 shadow-sm cursor-pointer transition-all hover:shadow-md ${liveOnline > 0 ? 'bg-emerald-600 border-emerald-500' : 'bg-white border-border hover:border-blue-300'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold text-sm ${liveOnline > 0 ? 'text-white/80' : 'text-muted-foreground'}`}>Video Consultations</h3>
              <div className={`p-2 rounded-lg ${liveOnline > 0 ? 'bg-white/20' : 'bg-blue-500/10 text-blue-600'}`}>
                <Video size={18} className={liveOnline > 0 ? 'text-white animate-pulse' : ''} />
              </div>
            </div>
            <p className={`text-4xl font-bold font-serif ${liveOnline > 0 ? 'text-white' : 'text-blue-600'}`}>{onlineAppts.length}</p>
            <div className="flex items-center justify-between mt-3">
              <span className={`text-xs font-semibold ${liveOnline > 0 ? 'text-emerald-100' : 'text-muted-foreground'}`}>
                {liveOnline > 0 ? `🟢 ${liveOnline} live now` : pendingOnline > 0 ? `${pendingOnline} pending` : 'Manage sessions'}
              </span>
              <ArrowRight size={14} className={liveOnline > 0 ? 'text-white/60' : 'text-muted-foreground/40'} />
            </div>
          </div>
        </Link>
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
