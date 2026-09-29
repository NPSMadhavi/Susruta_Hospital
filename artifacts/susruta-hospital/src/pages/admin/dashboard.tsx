import React, { useEffect, useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useListAppointments } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Users, Calendar as CalendarIcon, Clock, Video, ArrowRight } from "lucide-react";
import { AdminPagination } from "@/components/admin/AdminPagination";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminDashboard() {
  const { data: appointments = [], isLoading } = useListAppointments();
  const [onlineAppts, setOnlineAppts] = useState<any[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(true);
  const [recentPage, setRecentPage] = useState(1);
  const PAGE_SIZE = 10;

  const [onlineError, setOnlineError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/online-appointments/admin`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error(errData.message || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then(data => {
        setOnlineAppts(Array.isArray(data) ? data : []);
        setOnlineError(null);
      })
      .catch(err => {
        console.error("[AdminDashboard] Error fetching online appointments:", err.message);
        setOnlineError(err.message || "Failed to load online appointments.");
      })
      .finally(() => setOnlineLoading(false));
  }, []);

  const pending = appointments.filter(a => a.status === 'pending').length;
  const confirmed = appointments.filter(a => a.status === 'confirmed').length;
  const liveOnline = onlineAppts.filter(a => a.joinEnabled).length;
  const pendingOnline = onlineAppts.filter(a => a.status === 'pending').length;

  const formatTime12h = (timeStr?: string) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":").map(Number);
    if (isNaN(h)) return timeStr;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${m < 10 ? "0" + m : m} ${ampm}`;
  };

  const normalizedOffline = appointments.map((a: any) => ({
    id: `offline-${a.id}`,
    patientName: a.patientName || a.patient?.name || "Unknown Patient",
    dateTime: `${a.date || ''} ${a.timeSlot ? 'at ' + a.timeSlot : ''}`.trim(),
    phone: a.patientPhone || a.patient?.phone || "N/A",
    type: "Offline" as const,
    status: a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : "Pending",
    sortKey: a.createdAt || a.date || "",
  }));

  const normalizedOnline = onlineAppts.map((a: any) => {
    const slotDate = a.slot?.date || a.createdAt?.split("T")[0] || "";
    const slotTime = a.slot ? `${formatTime12h(a.slot.startTime)} - ${formatTime12h(a.slot.endTime)}` : "";
    return {
      id: `online-${a.id}`,
      patientName: a.patient?.name || "Unknown Patient",
      dateTime: `${slotDate} ${slotTime ? 'at ' + slotTime : ''}`.trim(),
      phone: a.patient?.phone || "N/A",
      type: "Online" as const,
      status: a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : "Pending",
      sortKey: a.createdAt || slotDate || "",
    };
  });

  const allRequests = [...normalizedOffline, ...normalizedOnline].sort((a, b) => 
    b.sortKey.localeCompare(a.sortKey)
  );

  const paginatedRequests = allRequests.slice((recentPage - 1) * PAGE_SIZE, recentPage * PAGE_SIZE);

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-sans font-bold text-foreground">Overview</h1>
        <p className="text-muted-foreground">Welcome to Susruta Hospital Admin Panel.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Total Offline <br></br> Consultations</h3>
            <div className="p-2 bg-primary/10 text-primary rounded-lg"><Users size={18}/></div>
          </div>
          <p className="text-4xl font-bold font-sans">{isLoading ? '-' : appointments.length}</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Pending Offline<br></br> Consultations</h3>
            <div className="p-2 bg-yellow-500/10 text-yellow-600 rounded-lg"><Clock size={18}/></div>
          </div>
          <p className="text-4xl font-bold font-sans text-yellow-600">{isLoading ? '-' : pending}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Confirmed Offline<br></br> Consultations</h3>
            <div className="p-2 bg-green-500/10 text-green-600 rounded-lg"><CalendarIcon size={18}/></div>
          </div>
          <p className="text-4xl font-bold font-sans text-green-600">{isLoading ? '-' : confirmed}</p>
        </div>

        {/* Video Consultations quick link */}
        <Link href="/admin/online-appointments">
          <div className={`p-6 rounded-2xl border-2 shadow-sm cursor-pointer transition-all hover:shadow-md ${liveOnline > 0 ? 'bg-emerald-600 border-emerald-500' : 'bg-white border-border hover:border-blue-300'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold text-sm ${liveOnline > 0 ? 'text-white/80' : 'text-muted-foreground'}`}>Online Consultations</h3>
              <div className={`p-2 rounded-lg ${liveOnline > 0 ? 'bg-white/20' : 'bg-blue-500/10 text-blue-600'}`}>
                <Video size={18} className={liveOnline > 0 ? 'text-white animate-pulse' : ''} />
              </div>
            </div>
            <p className={`text-4xl font-bold font-sans ${liveOnline > 0 ? 'text-white' : 'text-blue-600'}`}>{onlineLoading ? '-' : onlineAppts.length}</p>
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
          <h2 className="font-bold text-lg">Recent Requests</h2>
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
                  <th className="p-4 font-medium">Type</th>
                  <th className="p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginatedRequests.map(apt => (
                  <tr key={apt.id} className="hover:bg-muted/30">
                    <td className="p-4 font-medium text-foreground">{apt.patientName}</td>
                    <td className="p-4">{apt.dateTime}</td>
                    <td className="p-4">{apt.phone}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-semibold ${
                        apt.type === 'Online'
                          ?'text-[#1B3227]'
                          :'text-[#1B3227]'
                      }`}>
                        {apt.type}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                        apt.status.toLowerCase() === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : apt.status.toLowerCase() === 'pending'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : apt.status.toLowerCase() === 'confirmed'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-gray-50 text-gray-700 border border-gray-200'
                      }`}>
                        {apt.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {allRequests.length === 0 && (
                  <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No recent requests found.</td></tr>
                )}
              </tbody>
            </table>
          )}
          {!isLoading && (
            <AdminPagination
              currentPage={recentPage}
              totalItems={allRequests.length}
              pageSize={PAGE_SIZE}
              onPageChange={setRecentPage}
              itemLabel="requests"
            />
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
