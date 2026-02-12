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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
  topUsers: { userId: string; userName: string; userEmail: string; activityCount: number; totalTimeMs: number }[];
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

function formatTimeAxis(ms: number): string {
  const hours = ms / 3600000;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  const minutes = ms / 60000;
  return `${Math.round(minutes)}m`;
}

export default function AdminUserActivityPage() {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>("all");
  const [activityFilter, setActivityFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("30");

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
      .then((r) => r.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
                    <div className="text-2xl font-bold">{formatDuration(data.summary.totalTimeMs)}</div>
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

          {/* Time by Category + Top Users */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Time Spent by Category */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Time Spent by Category</CardTitle>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Total time across features</p>
              </CardHeader>
              <CardContent>
                {data.timeByCategory.length === 0 || data.timeByCategory.every((d) => d.totalMs === 0) ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">No time data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.timeByCategory.length * 40 + 40)}>
                    <BarChart data={data.timeByCategory} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <XAxis
                        type="number"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatTimeAxis}
                      />
                      <YAxis
                        type="category"
                        dataKey="label"
                        fontSize={12}
                        tickLine={false}
                        axisLine={false}
                        width={120}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e5e5",
                          fontSize: "13px",
                        }}
                        formatter={(value: number | undefined) => [formatDuration(value ?? 0), "Time"]}
                      />
                      <Bar dataKey="totalMs" radius={[0, 4, 4, 0]} barSize={20}>
                        {data.timeByCategory.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Top Users */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top 10 Active Users</CardTitle>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Users ranked by activity count</p>
              </CardHeader>
              <CardContent>
                {data.topUsers.length === 0 ? (
                  <div className="flex items-center justify-center h-[300px]">
                    <p className="text-sm text-neutral-400 dark:text-neutral-500">No user data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={Math.max(200, data.topUsers.length * 40 + 40)}>
                    <BarChart
                      data={data.topUsers.map((u) => ({
                        name: u.userName.length > 16 ? u.userName.slice(0, 14) + "..." : u.userName,
                        count: u.activityCount,
                      }))}
                      layout="vertical"
                      margin={{ left: 10, right: 20, top: 5, bottom: 5 }}
                    >
                      <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={120}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: "8px",
                          border: "1px solid #e5e5e5",
                          fontSize: "13px",
                        }}
                        formatter={(value: number | undefined) => [value ?? 0, "Activities"]}
                      />
                      <Bar dataKey="count" fill="#525252" radius={[0, 4, 4, 0]} barSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
