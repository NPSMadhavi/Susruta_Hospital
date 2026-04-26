import React, { useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useGetAdminMe, useAdminLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MessageSquare, Settings, LogOut, LayoutDashboard, ChevronLeft, Users, Video, UserCheck, X, Bell, Heart } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";
import { useAdminNotifications } from "@/hooks/useAdminNotifications";

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
    const interval = setInterval(checkNewAppts, 20_000);
    return () => clearInterval(interval);
  }, [admin, checkNewAppts]);

  // SSE — listen for call_ended so admin gets an immediate chime
  useEffect(() => {
    if (!admin) return;
    const es = new EventSource(`${API}/appointments/notifications`, { withCredentials: true });
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "call_ended") {
          notify("Video Call Ended", "The consultation call has finished. You can now review the appointment.");
        } else if (data.type === "new_appointment") {
          // Handled by polling but also surfaces here for immediacy
        }
      } catch { /* ignore parse errors */ }
    };
    return () => es.close();
  }, [admin, notify]);

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

  const navItems = [
    { href: "/admin", icon: <LayoutDashboard size={20}/>, label: "Dashboard" },
    { href: "/admin/appointments", icon: <Calendar size={20}/>, label: "Appointments" },
    { href: "/admin/availability", icon: <Clock size={20}/>, label: "Offline Slots" },
    { href: "/admin/online-slots", icon: <Video size={20}/>, label: "Online Slots" },
    { href: "/admin/patients", icon: <UserCheck size={20}/>, label: "Patients" },
    { href: "/admin/donations", icon: <Heart size={20}/>, label: "Donations" },
    { href: "/admin/testimonials", icon: <MessageSquare size={20}/>, label: "Testimonials" },
    { href: "/admin/subscribers", icon: <Users size={20}/>, label: "Subscribers" },
    { href: "/admin/settings", icon: <Settings size={20}/>, label: "Settings" },
  ];

  const mobileNavItems = navItems.slice(0, 6);

  return (
    <div className="min-h-screen flex bg-muted/30">
      {/* Sidebar */}
      <aside className="w-64 bg-foreground text-white flex-col hidden md:flex shrink-0">
        <div className="px-5 py-4 border-b border-white/10">
          <img src={logoImg} alt="Susruta Hospital" className="h-8 w-auto max-w-[160px] object-contain brightness-0 invert" />
          <p className="text-white/45 text-xs font-semibold uppercase tracking-widest mt-1">Admin Panel</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          {navItems.map(item => {
            const isActive = location === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-primary text-white font-medium shadow-lg shadow-primary/20' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          {/* Notification permission button */}
          {permission !== "granted" && (
            <button
              onClick={requestPermission}
              className="w-full flex items-center gap-2 px-4 py-2 mb-2 rounded-xl text-xs text-amber-300 hover:bg-white/10 border border-amber-400/30 transition-colors"
            >
              <Bell size={14} /> Enable notifications
            </button>
          )}
          <Button variant="ghost" className="w-full justify-start text-white/60 hover:text-white hover:bg-white/10" onClick={handleLogout}>
            <LogOut size={20} className="mr-3" /> Logout
          </Button>
          <Link href="/" className="flex items-center gap-2 mt-4 text-xs text-white/40 hover:text-white/80 px-4">
            <ChevronLeft size={14} /> Back to Website
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="md:hidden bg-foreground text-white px-4 py-3 flex justify-between items-center shrink-0">
          <img src={logoImg} alt="Susruta Hospital" className="h-7 w-auto object-contain brightness-0 invert" />
          <div className="flex items-center gap-2">
            {permission !== "granted" && (
              <button onClick={requestPermission} className="p-1.5 text-amber-300 hover:text-amber-200" title="Enable notifications">
                <Bell size={18} />
              </button>
            )}
            <Button variant="ghost" size="sm" className="text-white/70 hover:text-white" onClick={handleLogout}>
              <LogOut size={16} className="mr-1.5" /> Logout
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-10 pb-20 md:pb-10">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#1a3d2b] border-t border-white/10 flex z-50 safe-area-bottom">
        {mobileNavItems.map(item => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-semibold transition-colors ${isActive ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
            >
              <span className={`${isActive ? 'text-white' : 'text-white/40'}`}>
                {React.cloneElement(item.icon as React.ReactElement<any>, { size: 18 })}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Global toast notifications — visible on ALL admin pages */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id}
            className="pointer-events-auto flex items-start gap-3 bg-[#1a3d2b] text-white rounded-2xl shadow-2xl px-4 py-3 min-w-[280px] max-w-[340px] border border-white/10 animate-in slide-in-from-right-4 duration-300"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-400/20 border border-emerald-400/40 flex items-center justify-center shrink-0 mt-0.5">
              <Bell size={15} className="text-emerald-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">{toast.title}</p>
              <p className="text-xs text-white/60 mt-0.5 leading-snug">{toast.body}</p>
              <Link href="/admin/online-appointments" className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold mt-1 block">
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
