"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Users, Clock, Activity, TrendingUp, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const CATEGORY_COLORS: Record<string, string> = {
  AI_CHAT: "#6366f1",
  ASSIGNMENT_VIEW: "#8b5cf6",
  ASSIGNMENT_SUBMIT: "#a78bfa",
  GRADING: "#10b981",
  SIMULATION: "#f59e0b",
  PROBLEM_GEN: "#ec4899",
  ANALYTICS_VIEW: "#06b6d4",
  ADMIN_ACTION: "#64748b",
};

const CATEGORY_LABELS: Record<string, string> = {
  AI_CHAT: "AI Chat",
  ASSIGNMENT_VIEW: "View Assignments",
  ASSIGNMENT_SUBMIT: "Submit Work",
  GRADING: "Grading",
  SIMULATION: "Simulations",
  PROBLEM_GEN: "Problem Gen",
  ANALYTICS_VIEW: "Analytics",
  ADMIN_ACTION: "Admin",
};

interface UserOption {
  id: string;
  name: string | null;
  email: string;
}

interface ActivityData {
  summary: {
    totalActivities: number;
    uniqueUsers: number;
    totalTimeMs: number;
    avgDailyActivities: number;
  };
  dailyTrend: Record<string, string | number>[];
  trendCategories: string[];
  timeByCategory: { category: string; label: string; totalMs: number; count: number; color: string }[];
  timeByTimeslot: { label: string; count: number; totalMs: number }[];
  timeByRole: { label: string; count: number; totalMs: number }[];
  csvData: { id: string; userName: string; userEmail: string; category: string; detail: string | null; durationMs: number | null; createdAt: string }[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}


export default function AdminUserActivityPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("all");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30");
  const [breakdownView, setBreakdownView] = useState<"activity" | "timeslot" | "identity">("activity");

  // Fetch user list for dropdown
  useEffect(() => {
    fetch("/api/admin/users")
      .then((r) => r.json())
      .then((json) => {
        const list = (json.users || json || []).map((u: { id: string; name: string | null; email: string }) => ({
          id: u.id,
          name: u.name,
          email: u.email,
        }));
        setUsers(list);
      })
      .catch(() => {});
  }, []);

  // Fetch activity data
  const fetchData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (userId !== "all") params.set("userId", userId);
    if (activityFilter !== "all") params.set("filter", activityFilter);
    params.set("range", dateRange);

    fetch(`/api/admin/user-activity?${params.toString()}`)
      .then((r) => {
        if (!r.ok) throw new Error("API error");
        return r.json();
      })
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [userId, activityFilter, dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownloadCSV = () => {
    if (!data?.csvData?.length) return;

    const headers = ["Date", "Time", "User", "Email", "Category", "Detail", "Duration (sec)"];
    const rows = data.csvData.map((row) => {
      const d = new Date(row.createdAt);
      return [
        d.toLocaleDateString(),
        d.toLocaleTimeString(),
        row.userName,
        row.userEmail,
        CATEGORY_LABELS[row.category] || row.category,
        row.detail || "",
        row.durationMs ? Math.round(row.durationMs / 1000) : "",
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `user-activity-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activityFilters = [
    { key: "all", label: "All" },
    { key: "chat", label: "Chat" },
    { key: "simulation", label: "Simulation" },
    { key: "submission", label: "Submission" },
    { key: "other", label: "Other" },
  ];

  const rangeFilters = [
    { key: "7", label: "7d" },
    { key: "30", label: "30d" },
    { key: "90", label: "90d" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-gray-100">User Activity</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Monitor how users engage with platform features
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* User selector */}
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.name || u.email} {u.name ? `(${u.email})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Activity type filter */}
        <div className="flex items-center gap-1.5">
          {activityFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActivityFilter(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                activityFilter === f.key
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Date range filter */}
        <div className="flex items-center gap-1.5">
          {rangeFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setDateRange(f.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                dateRange === f.key
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* CSV download */}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadCSV}
            disabled={!data?.csvData?.length}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-neutral-400 dark:text-neutral-500" />
        </div>
      ) : !data ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-neutral-500 dark:text-neutral-400">Failed to load activity data.</p>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="gradient-card-purple border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/60 dark:bg-white/20 flex items-center justify-center">
                    <Activity className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.summary.totalActivities.toLocaleString()}</div>
                    <p className="text-sm font-medium">Total Activities</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="gradient-card-blue border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/60 dark:bg-white/20 flex items-center justify-center">
                    <Users className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.summary.uniqueUsers}</div>
                    <p className="text-sm font-medium">Unique Users</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="gradient-card-green border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/60 dark:bg-white/20 flex items-center justify-center">
                    <Clock className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{(data.summary.totalTimeMs / 3600000).toFixed(1)}h</div>
                    <p className="text-sm font-medium">Total Time Spent</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="gradient-card-pink border-0">
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-white/60 dark:bg-white/20 flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold">{data.summary.avgDailyActivities}</div>
                    <p className="text-sm font-medium">Avg Daily Activities</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Activity Trend - Stacked Area Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Daily Activity Trend</CardTitle>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Activity count by category over time</p>
            </CardHeader>
            <CardContent>
              {data.dailyTrend.every((d) => d.total === 0) ? (
                <div className="flex items-center justify-center h-[350px]">
                  <p className="text-sm text-neutral-400 dark:text-neutral-500">No activity in this period</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={data.dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                    <XAxis
                      dataKey="label"
                      fontSize={11}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid #e5e5e5",
                        fontSize: "13px",
                      }}
                      formatter={(value: number | undefined, name: string | undefined) => [
                        value ?? 0,
                        CATEGORY_LABELS[name || ""] || name || "",
                      ]}
                    />
                    {data.trendCategories.map((cat) => (
                      <Area
                        key={cat}
                        type="monotone"
                        dataKey={cat}
                        stackId="1"
                        fill={CATEGORY_COLORS[cat] || "#94a3b8"}
                        stroke={CATEGORY_COLORS[cat] || "#94a3b8"}
                        fillOpacity={0.6}
                      />
                    ))}
                  </AreaChart>
                </ResponsiveContainer>
              )}

              {/* Legend */}
              {data.trendCategories.length > 1 && (
                <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                  {data.trendCategories.map((cat) => (
                    <div key={cat} className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: CATEGORY_COLORS[cat] || "#94a3b8" }}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {CATEGORY_LABELS[cat] || cat}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Time Usage Breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Time Usage Breakdown</CardTitle>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Numeric time usage grouped by different dimensions</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {([
                    { key: "activity" as const, label: "Activity" },
                    { key: "timeslot" as const, label: "Timeslot" },
                    { key: "identity" as const, label: "Identity" },
                  ]).map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setBreakdownView(f.key)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        breakdownView === f.key
                          ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                          : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const items = breakdownView === "activity"
                  ? data.timeByCategory.map((d) => ({ label: d.label, count: d.count, totalMs: d.totalMs, color: d.color }))
                  : breakdownView === "timeslot"
                    ? data.timeByTimeslot
                    : data.timeByRole;

                if (items.length === 0) {
                  return (
                    <div className="flex items-center justify-center py-12">
                      <p className="text-sm text-neutral-400 dark:text-neutral-500">No data available</p>
                    </div>
                  );
                }

                const maxMs = Math.max(...items.map((d) => d.totalMs), 1);

                return (
                  <div className="space-y-3">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <div className="w-[140px] shrink-0">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{item.label}</span>
                        </div>
                        <div className="flex-1 flex items-center gap-3">
                          <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.max((item.totalMs / maxMs) * 100, item.totalMs > 0 ? 2 : 0)}%`,
                                backgroundColor: "color" in item ? (item as { color: string }).color : "#6366f1",
                              }}
                            />
                          </div>
                          <div className="w-[80px] text-right shrink-0">
                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                              {(item.totalMs / 3600000).toFixed(1)}h
                            </span>
                          </div>
                          <div className="w-[60px] text-right shrink-0">
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {item.count} {item.count === 1 ? "use" : "uses"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
