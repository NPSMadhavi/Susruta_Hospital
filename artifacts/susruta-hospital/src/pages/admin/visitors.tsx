import React, { useEffect, useState, useCallback } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Users, Activity, Globe, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function AdminVisitors() {
  const [visitorStats, setVisitorStats] = useState<{
    viewingNow: number;
    todayVisitors: number;
    totalUniqueVisitors: number;
  }>({
    viewingNow: 0,
    todayVisitors: 0,
    totalUniqueVisitors: 0,
  });
  const [visitorLoading, setVisitorLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchVisitorStats = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/admin/visitors/stats`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setVisitorStats({
          viewingNow: Number(data.viewingNow ?? data.liveVisitors) || 0,
          todayVisitors: Number(data.todayVisitors) || 0,
          totalUniqueVisitors: Number(data.totalUniqueVisitors) || 0,
        });
      }
    } catch {
      // Non-blocking fail-safe
    } finally {
      setVisitorLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchVisitorStats();
  };

  useEffect(() => {
    fetchVisitorStats();
    // 30-second polling for live presence refresh
    const interval = setInterval(fetchVisitorStats, 30000);
    return () => clearInterval(interval);
  }, [fetchVisitorStats]);

  return (
    <AdminLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-sans font-bold text-foreground">Visitors</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time public website visitor statistics in Indian Standard Time (IST).
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="self-start sm:self-auto gap-2 text-xs font-medium"
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          Refresh Stats
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Viewing Now */}
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <h3 className="font-semibold text-muted-foreground text-sm">Live Visitors</h3>
            </div>
            <div className="p-2.5 bg-emerald-500/10 text-emerald-600 rounded-xl">
              <Activity size={20} />
            </div>
          </div>
          <p className="text-5xl font-bold font-sans text-emerald-600 tracking-tight">
            {visitorLoading ? "-" : visitorStats.viewingNow}
          </p>
          <p className="text-xs text-muted-foreground mt-3">
            Users currently viewing the website
          </p>
        </div>

        {/* Card 2: Today's Visitors */}
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Today's Visitors</h3>
            <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
              <Users size={20} />
            </div>
          </div>
          <p className="text-5xl font-bold font-sans text-primary tracking-tight">
            {visitorLoading ? "-" : visitorStats.todayVisitors}
          </p>
        </div>

        {/* Card 3: Total Unique Visitors */}
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm transition-all hover:shadow-md">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-muted-foreground text-sm">Total Unique Visitors</h3>
            <div className="p-2.5 bg-blue-500/10 text-blue-600 rounded-xl">
              <Globe size={20} />
            </div>
          </div>
          <p className="text-5xl font-bold font-sans text-blue-600 tracking-tight">
            {visitorLoading ? "-" : visitorStats.totalUniqueVisitors}
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
