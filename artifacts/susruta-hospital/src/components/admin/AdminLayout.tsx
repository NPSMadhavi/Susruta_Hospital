import React, { useEffect, useRef, useCallback, useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetAdminMe, useAdminLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MessageSquare, Settings, LogOut, LayoutDashboard, ChevronLeft, Users, Video, UserCheck, UserX, X, Bell, Heart, BriefcaseMedical } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";

// Carbon Design System "User Activity" Icon (matching carbon_user-activity.png)
function CarbonUserActivity({ size = 18, className, ...props }: React.SVGProps<SVGSVGElement> & { size?: number | string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M25 23h-.021a1 1 0 0 1-.94-.726L20.87 11.19l-1.935 5.16A1 1 0 0 1 18 17h-4v-2h3.307l2.757-7.351a1 1 0 0 1 1.898.076l3.111 10.892l1.979-5.933A1 1 0 0 1 28 12h4v2h-3.28l-2.772 8.316A1 1 0 0 1 25 23m-10 7h-2v-7a3.003 3.003 0 0 0-3-3H6a3.003 3.003 0 0 0-3 3v7H1v-7a5.006 5.006 0 0 1 5-5h4a5.006 5.006 0 0 1 5 5ZM8 8a3 3 0 1 1-3 3a3 3 0 0 1 3-3m0-2a5 5 0 1 0 5 5a5 5 0 0 0-5-5" />
    </svg>
  );
}

const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function adminFetch(path: string) {
  const r = await fetch(`${API}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error("admin fetch failed");
  return r.json();
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: admin, isLoading, isError } = useGetAdminMe({ query: { retry: false }});
  const logoutMutation = useAdminLogout();
  const { permission, requestPermission, notify, toasts, dismissToast } = useAdminNotifications();
  const [donationCount, setDonationCount] = useState<number>(0);
  const [pendingDeletionCount, setPendingDeletionCount] = useState<number>(0);

  useEffect(() => {
    if (!admin) return;
    adminFetch("/donations/count")
      .then(res => {
        if (typeof res?.count === "number") {
          setDonationCount(res.count);
        }
      })
      .catch(() => {});

    adminFetch("/account-deletion-requests/count")
      .then(res => {
        if (typeof res?.count === "number") {
          setPendingDeletionCount(res.count);
        }
      })
      .catch(() => {});
  }, [admin]);

  useEffect(() => {
    const onCountChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.count === "number") {
        setDonationCount(detail.count);
      } else if (typeof detail?.delta === "number") {
        setDonationCount(prev => Math.max(0, prev + detail.delta));
      }
    };
    const onDeletionCountChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail?.count === "number") {
        setPendingDeletionCount(detail.count);
      } else if (typeof detail?.delta === "number") {
        setPendingDeletionCount(prev => Math.max(0, prev + detail.delta));
      }
    };
    window.addEventListener("susruta:donation_count_change", onCountChange);
    window.addEventListener("susruta:deletion_request_count_change", onDeletionCountChange);
    return () => {
      window.removeEventListener("susruta:donation_count_change", onCountChange);
      window.removeEventListener("susruta:deletion_request_count_change", onDeletionCountChange);
    };
  }, []);

  // When admin navigates to /admin/account-delete-requests, clear the unseen badge count
  useEffect(() => {
    if (location === "/admin/account-delete-requests") {
      setPendingDeletionCount(0);
    }
  }, [location]);

  // Track seen appointment IDs to detect new arrivals
  const seenIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);

  const checkNewAppts = useCallback(async () => {
    try {
      const list: { id: number; status: string; patient?: { name?: string } }[] = await adminFetch("/online-appointments/admin");
      const incoming = list.filter(a => a.status === "pending");

      if (!initializedRef.current) {
        // First load — just seed the seen set, don't notify
        incoming.forEach(a => seenIdsRef.current.add(a.id));
        initializedRef.current = true;
        return;
      }

      const newOnes = incoming.filter(a => !seenIdsRef.current.has(a.id));
      newOnes.forEach(a => {
        seenIdsRef.current.add(a.id);
        const name = a.patient?.name ?? "A patient";
        notify("New Online Booking!", `${name} booked an online consultation.`);
      });
    } catch {
      // Silent — layout shouldn't crash on poll failures
    }
  }, [notify]);

  useEffect(() => {
    if (!admin) return;
    checkNewAppts();
  }, [admin, checkNewAppts]);

  // SSE — single consolidated stream for all admin notifications
  useEffect(() => {
    if (!admin) return;
    const es = new EventSource(`${API}/appointments/notifications`, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        window.dispatchEvent(new CustomEvent("susruta:admin_notification", { detail: data }));
        if (data.type === "call_ended") {
          const title = data.patientName
            ? `Call ended — ${data.patientName}`
            : "Video Call Ended";
          const body = data.patientName
            ? `${data.patientName}'s consultation has finished. Please upload their prescription.`
            : "The consultation call has finished. You can now review the appointment.";
          notify(title, body);
        } else if (data.type === "new_appointment") {
          const name = data.appointment?.patientName || "A patient";
          notify("New In-Person Booking!", `${name} booked an in-person appointment.`);
        } else if (data.type === "new_online_appointment") {
          const name = data.patient?.name || "A patient";
          notify("New Online Booking!", `${name} booked an online consultation.`);
        } else if (data.type === "direct_call_updated" && data.status === "ended") {
          notify("Direct Call Ended", "The patient consultation call has ended.");
        } else if (data.type === "new_donation") {
          setDonationCount(prev => prev + 1);
          const name = data.donation?.patientName || "A donor";
          const amount = data.donation?.amount ? `₹${data.donation.amount}` : "";
          notify("New Donation Received!", `${name} made a donation of ${amount}.`);
        } else if (data.type === "new_deletion_request") {
          if (window.location.pathname === "/admin/account-delete-requests") {
            setPendingDeletionCount(0);
          } else {
            setPendingDeletionCount(prev => prev + 1);
          }
          const name = data.request?.patientName || "A patient";
          notify("Account Deletion Request", `${name} requested account deletion (15-day cancellation period active).`);
        } else if (data.type === "deletion_request_cancelled") {
          setPendingDeletionCount(prev => Math.max(0, prev - 1));
        }
      } catch { /* ignore parse errors */ }
    };
    return () => es.close();
  }, [admin?.username, notify]);

  // Protect route
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-background">Loading...</div>;
  if (isError || !admin) {
    window.location.href = "/admin/login";
    return null;
  }

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => window.location.href = "/admin/login"
    });
  };

  const dashboardGroup = [
    { href: "/admin", icon: <LayoutDashboard size={18}/>, label: "Dashboard" },
    { href: "/admin/appointments", icon: <Calendar size={18}/>, label: "Appointments" },
    { href: "/admin/availability", icon: <Clock size={18}/>, label: "Offline Slots" },
    { href: "/admin/online-slots", icon: <Video size={18}/>, label: "Online Slots" },
  ];

  const managementGroup = [
    { href: "/admin/patients", icon: <UserCheck size={18}/>, label: "Patients" },
    { href: "/admin/medicines", icon: <BriefcaseMedical size={18}/>, label: "Medicines" },
    { href: "/admin/donations", icon: <Heart size={18}/>, label: "Donations", count: donationCount },
    { href: "/admin/testimonials", icon: <MessageSquare size={18}/>, label: "Testimonials" },
    { href: "/admin/subscribers", icon: <Users size={18}/>, label: "Subscribers" },
    { href: "/admin/visitors", icon: <CarbonUserActivity size={18}/>, label: "Visitors" },
    { href: "/admin/account-delete-requests", icon: <UserX size={18}/>, label: "Account Delete Requests", count: pendingDeletionCount },
    { href: "/admin/settings", icon: <Settings size={18}/>, label: "Settings" },
  ];

  const mobileNavItems = [...dashboardGroup, ...managementGroup].slice(0, 6);

  const renderNavItem = (item: { href: string; icon: React.ReactNode; label: string; count?: number }) => {
    const isActive = location === item.href || (item.href === "/admin/availability" && location === "/admin/offline-register");
    return (
      <Link 
        key={item.href} 
        href={item.href}
        className={`flex items-center gap-3 px-6 py-2.5 text-sm transition-all duration-150 relative ${
          isActive 
            ? 'bg-[#D95B2F]/10 text-[#D95B2F] font-semibold border-r-[5px] border-[#D95B2F] shadow-[0_1px_2px_rgba(0,0,0,0.05)]' 
            : 'text-[#42493E] font-normal hover:bg-[#D95B2F]/5 hover:text-[#D95B2F]'
        }`}
      >
        <span className={isActive ? 'text-[#D95B2F]' : 'text-[#42493E]'}>
          {item.icon}
        </span>
        <span className="flex-1">{item.label}</span>
        {typeof item.count === "number" && item.count > 0 && (
          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full min-w-[20px] text-center shrink-0 ml-auto ${
            isActive ? "bg-[#D95B2F] text-white" : "bg-[#EDEFEB] text-[#42493E]"
          }`}>
            {item.count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="admin-panel min-h-screen flex bg-[#F8F9FA] font-sans">
      {/* Sidebar */}
      <aside className="w-64 md:w-[282px] bg-white border-r border-[#EDEFEB] text-[#42493E] flex flex-col hidden md:flex shrink-0 h-screen sticky top-0">
        <div className="px-6 pt-3 pb-4 border-b border-[#EDEFEB] shrink-0">
          <img src={logoImg} alt="Susruta Hospital" className="h-9 w-auto max-w-[219px] object-contain" />
          <p className="text text-xs font-semibold uppercase tracking-widest mt-1">Admin Panel</p>
        </div>
        
        <nav className="flex-1 py-2 overflow-y-auto space-y-0.5">
          {dashboardGroup.map(renderNavItem)}
          {managementGroup.map(renderNavItem)}
        </nav>

        {/* SYSTEM SECTION PINNED AT BOTTOM */}
        <div className="p-4 border-t border-[#EDEFEB] shrink-0 space-y-1">
          {/* <p className="px-2 pb-2 text-[10px] font-bold text-[#8E938B] tracking-wider uppercase">SYSTEM</p> */}
          {permission !== "granted" && (
            <button
              onClick={requestPermission}
              className="w-full flex items-center gap-2 px-2 py-2 text-xs font-medium text-[#D95B2F] hover:bg-[#D95B2F]/10 rounded-lg transition-colors"
            >
              <Bell size={16} /> Enable notifications
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-2 py-2.5 text-xs font-bold text-[#D95B2F] hover:bg-[#D95B2F]/10 rounded-lg transition-colors"
          >
            <LogOut size={16} className="text-[#D95B2F]" />
            LOGOUT
          </button>
          <Link href="/" className="flex items-center gap-1.5 px-2 py-2 text-xs text-[#8E938B] hover:text-[#42493E]">
            <ChevronLeft size={14} /> Back to Website
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-[#EDEFEB] text-[#42493E] px-4 py-3 flex justify-between items-center shrink-0">
          <img src={logoImg} alt="Susruta Hospital" className="h-7 w-auto object-contain" />
          <div className="flex items-center gap-2">
            {permission !== "granted" && (
              <button onClick={requestPermission} className="p-1.5 text-amber-600 hover:text-amber-700" title="Enable notifications">
                <Bell size={18} />
              </button>
            )}
            <Button variant="ghost" size="sm" className="text-[#D95B2F] hover:bg-[#D95B2F]/10 font-bold" onClick={handleLogout}>
              <LogOut size={16} className="mr-1.5" /> Logout
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-10 pb-20 md:pb-10">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-[#EDEFEB] flex z-50 safe-area-bottom shadow-lg">
        {mobileNavItems.map(item => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-semibold transition-colors ${isActive ? 'text-[#D95B2F] bg-[#D95B2F]/10' : 'text-[#42493E] hover:text-[#D95B2F]'}`}
            >
              <span className={isActive ? 'text-[#D95B2F]' : 'text-[#42493E]'}>
                {React.cloneElement(item.icon as React.ReactElement<any>, { size: 18 })}
              </span>
              <span>{item.label}</span>
              {typeof (item as any).count === "number" && (item as any).count > 0 && (
                <span className="absolute top-1 right-2 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-[#D95B2F] text-white">
                  {(item as any).count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Global toast notifications — visible on ALL admin pages */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id}
            className="pointer-events-auto flex items-start gap-3 bg-[#42493E] text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[280px] max-w-[340px] border border-white/10 animate-in slide-in-from-right-4 duration-300"
          >
            <div className="w-8 h-8 rounded-full bg-[#D95B2F]/20 border border-[#D95B2F]/40 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={15} className="text-[#D95B2F]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{toast.title}</p>
              <p className="text-xs text-white/70 mt-0.5 leading-snug">{toast.body}</p>
              <Link href="/admin/appointments" className="text-[11px] text-[#D95B2F] hover:text-[#e76d43] font-semibold mt-1 block">
                View appointment →
              </Link>
            </div>
            <button onClick={() => dismissToast(toast.id)} className="text-white/30 hover:text-white/70 shrink-0 mt-0.5">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
