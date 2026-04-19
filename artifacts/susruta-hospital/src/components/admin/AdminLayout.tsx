import React from "react";
import { Link, useLocation } from "wouter";
import { useGetAdminMe, useAdminLogout } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MessageSquare, Settings, LogOut, LayoutDashboard, ChevronLeft, Users, Video, UserCheck } from "lucide-react";
import logoImg from "@assets/logo_1773840200056.png";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: admin, isLoading, isError } = useGetAdminMe({ query: { retry: false }});
  const logoutMutation = useAdminLogout();

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
    { href: "/admin/availability", icon: <Clock size={20}/>, label: "Availability" },
    { href: "/admin/online-slots", icon: <Video size={20}/>, label: "Online Slots" },
    { href: "/admin/patients", icon: <UserCheck size={20}/>, label: "Patients" },
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
          <Button variant="ghost" size="sm" className="text-white/70 hover:text-white" onClick={handleLogout}>
            <LogOut size={16} className="mr-1.5" /> Logout
          </Button>
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
    </div>
  );
}
