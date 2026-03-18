import React, { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useListAppointments, useUpdateAppointment, useDeleteAppointment } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

export default function AdminAppointments() {
  const [filter, setFilter] = useState<string>("all");
  const { data: appointments = [], isLoading } = useListAppointments(filter !== 'all' ? { status: filter as any } : undefined);
  const updateMutation = useUpdateAppointment();
  const deleteMutation = useDeleteAppointment();
  const queryClient = useQueryClient();

  const handleStatus = (id: number, status: 'confirmed' | 'cancelled') => {
    updateMutation.mutate({ id, data: { status } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/appointments'] })
    });
  };

  const handleDelete = (id: number) => {
    if(confirm("Are you sure you want to delete this appointment?")) {
      deleteMutation.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/appointments'] })
      });
    }
  };

  return (
    <AdminLayout>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-serif font-bold text-foreground">Appointments</h1>
        <select 
          className="p-2 rounded-xl border border-border bg-white text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="p-4 font-medium">Patient</th>
                <th className="p-4 font-medium">Contact</th>
                <th className="p-4 font-medium">Date & Time</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center">Loading...</td></tr>
              ) : appointments.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No appointments found.</td></tr>
              ) : (
                appointments.map(apt => (
                  <tr key={apt.id} className="hover:bg-muted/30">
                    <td className="p-4">
                      <div className="font-bold">{apt.patientName}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]" title={apt.reason || ''}>{apt.reason || '-'}</div>
                    </td>
                    <td className="p-4">
                      <div>{apt.patientPhone}</div>
                      <div className="text-xs text-muted-foreground">{apt.patientEmail || '-'}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium">{formatDate(apt.date)}</div>
                      <div className="text-xs text-muted-foreground">{apt.timeSlot}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                        apt.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                        apt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {apt.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {apt.status === 'pending' && (
                        <>
                          <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleStatus(apt.id, 'confirmed')}>Confirm</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleStatus(apt.id, 'cancelled')}>Cancel</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(apt.id)} className="text-destructive hover:bg-destructive/10">Delete</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  );
}
