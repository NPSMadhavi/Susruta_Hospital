import React, { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { 
  useListOpenMonths, useOpenMonth, useCloseMonth,
  useListBlockedDates, useBlockDate, useUnblockDate 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, X } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function AdminAvailability() {
  const queryClient = useQueryClient();
  
  // Months
  const { data: openMonths = [] } = useListOpenMonths();
  const openMonthMut = useOpenMonth();
  const closeMonthMut = useCloseMonth();
  const [newMonth, setNewMonth] = useState("");

  // Dates
  const { data: blockedDates = [] } = useListBlockedDates();
  const blockDateMut = useBlockDate();
  const unblockDateMut = useUnblockDate();
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const handleOpenMonth = (e: React.FormEvent) => {
    e.preventDefault();
    if(!newMonth) return;
    openMonthMut.mutate({ data: { month: newMonth, isOpen: true } }, {
      onSuccess: () => {
        setNewMonth("");
        queryClient.invalidateQueries({ queryKey: ['/api/availability/months'] });
      }
    });
  };

  const handleCloseMonth = (id: number) => {
    if(confirm("Close this month? Users won't be able to book.")) {
      closeMonthMut.mutate({ id }, {
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/availability/months'] })
      });
    }
  };

  const handleBlockDate = (e: React.FormEvent) => {
    e.preventDefault();
    if(!newBlockedDate) return;
    blockDateMut.mutate({ data: { date: newBlockedDate, reason: blockReason } }, {
      onSuccess: () => {
        setNewBlockedDate("");
        setBlockReason("");
        queryClient.invalidateQueries({ queryKey: ['/api/availability/blocked-dates'] });
      }
    });
  };

  const handleUnblockDate = (id: number) => {
    unblockDateMut.mutate({ id }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/availability/blocked-dates'] })
    });
  };

  return (
    <AdminLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-sans font-bold text-foreground">Manage Availability</h1>
        <p className="text-muted-foreground">Control when patients can book appointments.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Open Months Section */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="font-bold text-lg flex items-center gap-2"><Calendar size={20}/> Open Months</h2>
            <p className="text-sm text-muted-foreground">Only opened months will appear in the booking form.</p>
          </div>
          
          <div className="p-6 border-b border-border">
            <form onSubmit={handleOpenMonth} className="flex gap-4">
              <input 
                type="month" 
                required 
                value={newMonth}
                onChange={e => setNewMonth(e.target.value)}
                className="flex-1 p-2 rounded-xl border border-border"
              />
              <Button type="submit" disabled={openMonthMut.isPending}>Open Month</Button>
            </form>
          </div>
          
          <ul className="divide-y divide-border">
            {openMonths.length === 0 ? (
              <li className="p-6 text-center text-muted-foreground text-sm">No months currently open.</li>
            ) : openMonths.map(m => (
              <li key={m.id} className="p-4 px-6 flex justify-between items-center hover:bg-muted/30">
                <span className="font-medium text-lg">{format(parseISO(`${m.month}-01`), 'MMMM yyyy')}</span>
                <Button size="sm" variant="destructive" onClick={() => handleCloseMonth(m.id)}>Close</Button>
              </li>
            ))}
          </ul>
        </div>

        {/* Blocked Dates Section */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="p-6 border-b border-border bg-muted/30">
            <h2 className="font-bold text-lg flex items-center gap-2"><X size={20} className="text-destructive"/> Block Specific Dates</h2>
            <p className="text-sm text-muted-foreground">Block out specific days (holidays, personal leave) within open months.</p>
          </div>
          
          <div className="p-6 border-b border-border">
            <form onSubmit={handleBlockDate} className="flex flex-col gap-4">
              <div className="flex gap-4">
                <input 
                  type="date" 
                  required 
                  value={newBlockedDate}
                  onChange={e => setNewBlockedDate(e.target.value)}
                  className="flex-1 p-2 rounded-xl border border-border"
                />
                <Button type="submit" variant="destructive" disabled={blockDateMut.isPending}>Block Date</Button>
              </div>
              <input 
                type="text" 
                placeholder="Reason (optional)"
                value={blockReason}
                onChange={e => setBlockReason(e.target.value)}
                className="w-full p-2 rounded-xl border border-border text-sm"
              />
            </form>
          </div>
          
          <ul className="divide-y divide-border">
            {blockedDates.length === 0 ? (
              <li className="p-6 text-center text-muted-foreground text-sm">No blocked dates.</li>
            ) : blockedDates.map(d => (
              <li key={d.id} className="p-4 px-6 flex justify-between items-center hover:bg-muted/30">
                <div>
                  <span className="font-medium text-destructive">{format(parseISO(d.date), 'MMM d, yyyy')}</span>
                  {d.reason && <span className="ml-2 text-sm text-muted-foreground">- {d.reason}</span>}
                </div>
                <Button size="sm" variant="outline" onClick={() => handleUnblockDate(d.id)}>Unblock</Button>
              </li>
            ))}
          </ul>
        </div>

      </div>
    </AdminLayout>
  );
}
