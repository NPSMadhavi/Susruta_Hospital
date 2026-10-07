import React, { useState, useMemo } from "react";
import { Link } from "wouter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { 
  useListOpenMonths, useOpenMonth,
  useListBlockedDates, useBlockDate, useUnblockDate,
  useListCustomTimings, useSetCustomTiming, useDeleteCustomTiming,
  CustomDayTiming
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, X, Clock } from "lucide-react";
import { format, parseISO } from "date-fns";

export default function AdminAvailability() {
  const queryClient = useQueryClient();
  
  // Months
  const { data: openMonths = [] } = useListOpenMonths();
  const openMonthMut = useOpenMonth();

  // Blocked Dates
  const { data: blockedDates = [] } = useListBlockedDates();
  const blockDateMut = useBlockDate();
  const unblockDateMut = useUnblockDate();

  // Custom Day Timings
  const { data: customTimings = [] } = useListCustomTimings();
  const setCustomTimingMut = useSetCustomTiming();
  const deleteCustomTimingMut = useDeleteCustomTiming();
  
  // Modal state for blocking a date
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [newBlockedDate, setNewBlockedDate] = useState("");
  const [blockReason, setBlockReason] = useState("");

  // Modal state for custom day timing
  const [isCustomTimingModalOpen, setIsCustomTimingModalOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [morningEnabled, setMorningEnabled] = useState(true);
  const [morningStart, setMorningStart] = useState("10:00 AM");
  const [morningEnd, setMorningEnd] = useState("01:00 PM");
  const [eveningEnabled, setEveningEnabled] = useState(true);
  const [eveningStart, setEveningStart] = useState("06:00 PM");
  const [eveningEnd, setEveningEnd] = useState("10:00 PM");
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30);
  const [timingNote, setTimingNote] = useState("");

  const resetCustomTimingForm = () => {
    setCustomDate("");
    setMorningEnabled(true);
    setMorningStart("10:00 AM");
    setMorningEnd("01:00 PM");
    setEveningEnabled(true);
    setEveningStart("06:00 PM");
    setEveningEnd("10:00 PM");
    setSlotIntervalMinutes(30);
    setTimingNote("");
  };

  const handleEditCustomTiming = (timing: CustomDayTiming) => {
    setCustomDate(timing.date);
    setMorningEnabled(timing.morningEnabled);
    setMorningStart(timing.morningStart);
    setMorningEnd(timing.morningEnd);
    setEveningEnabled(timing.eveningEnabled);
    setEveningStart(timing.eveningStart);
    setEveningEnd(timing.eveningEnd);
    setSlotIntervalMinutes(timing.slotIntervalMinutes || 30);
    setTimingNote(timing.note || "");
    setIsCustomTimingModalOpen(true);
  };

  // Determine year to display (e.g. 2026 or current year)
  const currentYear = useMemo(() => {
    if (openMonths.length > 0) {
      const y = parseInt(openMonths[0].month.split("-")[0], 10);
      if (!isNaN(y)) return y;
    }
    return new Date().getFullYear();
  }, [openMonths]);

  // All 12 months for the year
  const allMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = String(i + 1).padStart(2, "0");
      return `${currentYear}-${monthNum}`;
    });
  }, [currentYear]);

  // Map of month -> isOpen status
  const monthStatusMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const m of openMonths) {
      map.set(m.month, m.isOpen !== false);
    }
    return map;
  }, [openMonths]);

  const handleToggleMonth = (monthKey: string, currentIsOpen: boolean) => {
    const targetStatus = !currentIsOpen;
    openMonthMut.mutate(
      { data: { month: monthKey, isOpen: targetStatus } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/availability/months"] });
        },
      }
    );
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const handleSaveCustomTiming = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customDate) return;
    setCustomTimingMut.mutate(
      {
        data: {
          date: customDate,
          morningEnabled,
          morningStart,
          morningEnd,
          eveningEnabled,
          eveningStart,
          eveningEnd,
          slotIntervalMinutes,
          note: timingNote || null,
        },
      },
      {
        onSuccess: () => {
          resetCustomTimingForm();
          setIsCustomTimingModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/availability/custom-timings"] });
          queryClient.invalidateQueries({ queryKey: ["/api/availability/slots"] });
          queryClient.invalidateQueries({ queryKey: ["/api/appointments/offline/slots-status"] });
        },
      }
    );
  };

  const handleDeleteCustomTiming = (id: number) => {
    deleteCustomTimingMut.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/availability/custom-timings"] });
          queryClient.invalidateQueries({ queryKey: ["/api/availability/slots"] });
          queryClient.invalidateQueries({ queryKey: ["/api/appointments/offline/slots-status"] });
        },
      }
    );
  };

  const handleBlockDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockedDate || newBlockedDate < todayStr) return;
    blockDateMut.mutate(
      { data: { date: newBlockedDate, reason: blockReason || "Hospital Holiday" } },
      {
        onSuccess: () => {
          setNewBlockedDate("");
          setBlockReason("");
          setIsBlockModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/availability/blocked-dates"] });
        },
      }
    );
  };

  const handleUnblockDate = (id: number) => {
    unblockDateMut.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/availability/blocked-dates"] });
        },
      }
    );
  };

  return (
    <AdminLayout>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-[#1E293B]">Offline Consultation Slots</h1>
          <p className="text-xs text-[#64748B] mt-1">
            Manage slot availability, open months, custom day timings, and blocked dates.
          </p>
        </div>

        <div className="flex items-center gap-5">
          <Link
            href="/admin/offline-register"
            className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={15} />
            New Offline Register
          </Link>
        </div>
      </div>

      {/* OPEN MONTHS SECTION */}
      <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 shadow-sm mb-8">
        <div className="mb-5">
          <h2 className="text-md font-bold text-[#1E293B] tracking-wider">
            Open Months
          </h2>
          <p className="text-xs text-[#64748B] mt-0.5">
            Control which months are available for patient appointment booking.
          </p>
        </div>

        {/* Grid of All Months */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allMonths.map((monthKey) => {
            const currentMonthStr = format(new Date(), "yyyy-MM");
            const isPast = monthKey < currentMonthStr;
            const isOpen = !isPast && (monthStatusMap.has(monthKey) ? monthStatusMap.get(monthKey)! : true);
            const monthDate = parseISO(`${monthKey}-01`);
            const monthLabel = format(monthDate, "MMMM yyyy");

            return (
              <div
                key={monthKey}
                className={`border rounded-xl p-4 flex flex-col justify-between transition-all ${
                  isPast
                    ? "border-gray-200 bg-gray-50/60 opacity-60"
                    : "border-[#EDEFEB] bg-white hover:border-[#CBD5E1]"
                }`}
              >
                <div>
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                        isPast
                          ? "bg-gray-100 text-gray-400 border border-gray-200"
                          : isOpen
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-100"
                          : "bg-red-50 text-red-500 border border-red-100"
                      }`}
                    >
                      <Calendar size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-[#1E293B] leading-tight truncate">
                        {monthLabel}
                      </h3>
                      <div className="mt-1">
                        {isPast ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-gray-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                            Past
                          </span>
                        ) : isOpen ? (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                            Open
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                            CLOSE
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-[#64748B] mt-3">
                    {isPast
                      ? "Past month. Bookings disabled."
                      : isOpen
                      ? "Patients can book appointments."
                      : "Bookings closed."}
                  </p>
                </div>

                <div className="mt-4 pt-2 border-t border-[#F1F5F9]">
                  {isPast ? (
                    <span className="text-xs font-semibold text-gray-400">
                      Disabled (Past Month)
                    </span>
                  ) : isOpen ? (
                    <button
                      type="button"
                      onClick={() => handleToggleMonth(monthKey, true)}
                      className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                    >
                      Close Month
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleMonth(monthKey, false)}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      Open Month
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CUSTOM DAY TIMINGS SECTION */}
      <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 shadow-sm mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-md font-bold text-[#1E293B] tracking-wider flex items-center gap-2">
              <Clock size={18} className="text-[#D95B2F]" />
              Custom Day Timings
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Set specific consultation hours or custom time slots for a particular day (e.g. Sunday special hours, festivals).
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              resetCustomTimingForm();
              setIsCustomTimingModalOpen(true);
            }}
            className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={14} />
            Set Custom Timing
          </button>
        </div>

        {/* Custom Timings Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#EDEFEB] text-[12px] font-bold text-[#94A3B8] tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Day</th>
                <th className="py-3 px-4">Morning Session</th>
                <th className="py-3 px-4">Evening Session</th>
                <th className="py-3 px-4">Interval</th>
                <th className="py-3 px-4">Note / Reason</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEFEB] text-xs">
              {customTimings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#94A3B8]">
                    No custom day timings configured. Default timings apply (Sunday 10 AM - 1 PM; Mon-Sat 10 AM - 1 PM & 6 PM - 10 PM).
                  </td>
                </tr>
              ) : (
                customTimings.map((c) => {
                  const parsed = parseISO(c.date);
                  const formattedDate = format(parsed, "dd MMM yyyy").toUpperCase();
                  const dayName = format(parsed, "EEEE");

                  return (
                    <tr key={c.id} className="hover:bg-[#F8F9FA] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-[#334155]">
                        {formattedDate}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {dayName}
                      </td>
                      <td className="py-3.5 px-4">
                        {c.morningEnabled ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-semibold">
                            {c.morningStart} - {c.morningEnd}
                          </span>
                        ) : (
                          <span className="text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-100">Closed</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {c.eveningEnabled ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 font-semibold">
                            {c.eveningStart} - {c.eveningEnd}
                          </span>
                        ) : (
                          <span className="text-red-500 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-100">Closed</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {c.slotIntervalMinutes || 30} mins
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {c.note || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-3">
                        <button
                          type="button"
                          onClick={() => handleEditCustomTiming(c)}
                          className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteCustomTiming(c.id)}
                          className="text-xs font-semibold text-[#D95B2F] hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* BLOCKED DATES SECTION */}
      <div className="bg-white rounded-2xl border border-[#EDEFEB] p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="text-md font-bold text-[#1E293B] tracking-wider">
              Blocked Dates
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Prevent bookings on holidays, doctor leave and other unavailable days.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsBlockModalOpen(true)}
            className="bg-[#D95B2F] hover:bg-[#C84F27] text-white px-6 py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center gap-2 active:scale-95"
          >
            <Plus size={14} />
            Block Date
          </button>
        </div>

        {/* Blocked Dates Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#EDEFEB] text-[12px] font-bold text-[#94A3B8] tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Day</th>
                <th className="py-3 px-4">Reason</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDEFEB] text-xs">
              {blockedDates.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-[#94A3B8]">
                    No blocked dates recorded.
                  </td>
                </tr>
              ) : (
                blockedDates.map((b) => {
                  const parsed = parseISO(b.date);
                  const formattedDate = format(parsed, "dd MMM yyyy").toUpperCase();
                  const dayName = format(parsed, "EEEE");

                  return (
                    <tr key={b.id} className="hover:bg-[#F8F9FA] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-[#334155]">
                        {formattedDate}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {dayName}
                      </td>
                      <td className="py-3.5 px-4 text-[#64748B]">
                        {b.reason || "Hospital Holiday"}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-500 border border-red-100">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          BLOCKED
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleUnblockDate(b.id)}
                          className="text-xs font-semibold text-[#D95B2F] hover:underline cursor-pointer"
                        >
                          Unblock
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Set Custom Day Timing Modal Dialog */}
      {isCustomTimingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDEFEB]">
              <h3 className="font-bold text-base text-[#1E293B] flex items-center gap-2">
                <Clock size={18} className="text-[#D95B2F]" />
                Set Custom Timing for a Particular Day
              </h3>
              <button
                type="button"
                onClick={() => setIsCustomTimingModalOpen(false)}
                className="text-[#94A3B8] hover:text-[#334155] p-1 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCustomTiming} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
              <div>
                <label className="block text-xs font-bold text-[#475569] tracking-wider mb-1.5">
                  Select Date *
                </label>
                <input
                  type="date"
                  required
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                />
              </div>

              {/* Morning Session */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E293B]">Morning Session</span>
                  <label className="flex items-center gap-2 text-xs text-[#475569] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={morningEnabled}
                      onChange={(e) => setMorningEnabled(e.target.checked)}
                      className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                    />
                    Enable Session
                  </label>
                </div>
                {morningEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Start Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 10:00 AM"
                        value={morningStart}
                        onChange={(e) => setMorningStart(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#1E293B]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] mb-1">End Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 01:00 PM"
                        value={morningEnd}
                        onChange={(e) => setMorningEnd(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#1E293B]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Evening Session */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1E293B]">Evening Session</span>
                  <label className="flex items-center gap-2 text-xs text-[#475569] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eveningEnabled}
                      onChange={(e) => setEveningEnabled(e.target.checked)}
                      className="rounded text-[#D95B2F] focus:ring-[#D95B2F]"
                    />
                    Enable Session
                  </label>
                </div>
                {eveningEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] mb-1">Start Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 06:00 PM"
                        value={eveningStart}
                        onChange={(e) => setEveningStart(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#1E293B]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] mb-1">End Time</label>
                      <input
                        type="text"
                        placeholder="e.g. 10:00 PM"
                        value={eveningEnd}
                        onChange={(e) => setEveningEnd(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-xs text-[#1E293B]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Slot Interval */}
              <div>
                <label className="block text-xs font-bold text-[#475569] tracking-wider mb-1.5">
                  Slot Interval (Minutes)
                </label>
                <select
                  value={slotIntervalMinutes}
                  onChange={(e) => setSlotIntervalMinutes(Number(e.target.value))}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B]"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes (Default)</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes (1 Hour)</option>
                </select>
              </div>

              {/* Note / Reason */}
              <div>
                <label className="block text-xs font-bold text-[#475569] tracking-wider mb-1.5">
                  Note / Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Sunday Special Morning Hours, Festival Special"
                  value={timingNote}
                  onChange={(e) => setTimingNote(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCustomTimingModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={setCustomTimingMut.isPending}
                  className="bg-[#D95B2F] hover:bg-[#c04e26] text-white rounded-xl text-xs"
                >
                  {setCustomTimingMut.isPending ? "Saving..." : "Save Custom Timing"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Block Date Modal Dialog */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-[#EDEFEB] shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDEFEB]">
              <h3 className="font-bold text-base text-[#1E293B]">Block a Date</h3>
              <button
                type="button"
                onClick={() => setIsBlockModalOpen(false)}
                className="text-[#94A3B8] hover:text-[#334155] p-1 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleBlockDate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#475569] tracking-wider mb-1.5">
                  Date to Block *
                </label>
                <input
                  type="date"
                  required
                  min={todayStr}
                  value={newBlockedDate}
                  onChange={(e) => setNewBlockedDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#475569] tracking-wider mb-1.5">
                  Reason (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Hospital Holiday, Doctor Leave"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#CBD5E1] text-sm text-[#1E293B] focus:outline-none focus:ring-2 focus:ring-[#D95B2F]/20 focus:border-[#D95B2F]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={blockDateMut.isPending}
                  className="bg-[#D95B2F] hover:bg-[#c04e26] text-white rounded-xl text-xs"
                >
                  {blockDateMut.isPending ? "Blocking..." : "Block Date"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
