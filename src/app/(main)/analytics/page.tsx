"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Brain, MessageSquare, Clock, FileCheck, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import ContributionGraph from "@/components/activity/ContributionGraph";
import ActivityBreakdown from "@/components/activity/ActivityBreakdown";
import { useTrackTime } from "@/lib/use-track-time";

interface AnalyticsData {
  overview: {
    averagePercent: number;
    totalMessages: number;
    totalConversations: number;
    totalSubmissions: number;
    estimatedStudyMinutes: number;
  };
  weeklyActivity: { date: string; day: string; messages: number }[];
  scoreHistory: {
    title: string;
    score: number;
    totalPoints: number;
    percent: number;
    date: string;
  }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [heatmapData, setHeatmapData] = useState<{ date: string; count: number }[]>([]);
  const [breakdownData, setBreakdownData] = useState<{ category: string; count: number; totalMs?: number }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayActivities, setDayActivities] = useState<{ id: string; category: string; detail: string | null; durationMs: number | null; time: string }[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useTrackTime("ANALYTICS_VIEW");

  useEffect(() => {
    Promise.all([
      fetch("/api/analytics").then((r) => r.json()),
      fetch("/api/activity/heatmap").then((r) => r.json()),
      fetch("/api/activity/breakdown").then((r) => r.json()),
    ])
      .then(([analyticsJson, heatmapJson, breakdownJson]) => {
        setData(analyticsJson);
        setHeatmapData(heatmapJson.data || []);
        setBreakdownData(breakdownJson.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return "0s";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
    return `${seconds}s`;
  };

  const CATEGORY_LABELS: Record<string, string> = {
    AI_CHAT: "AI Chat",
    ASSIGNMENT_VIEW: "View Assignments",
    ASSIGNMENT_SUBMIT: "Submit Work",
    GRADING: "Grading",
    SIMULATION: "Simulations",
    PROBLEM_GEN: "Problem Generator",
    ANALYTICS_VIEW: "Analytics",
    ADMIN_ACTION: "Admin",
  };

  const handleSelectDate = useCallback((date: string) => {
    if (selectedDate === date) {
      setSelectedDate(null);
      setDayActivities([]);
      return;
    }
    setSelectedDate(date);
    setLoadingDetail(true);
    fetch(`/api/activity/detail?date=${date}`)
      .then((r) => r.json())
      .then((json) => {
        setDayActivities(json.activities || []);
        setLoadingDetail(false);
      })
      .catch(() => setLoadingDetail(false));
  }, [selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400 dark:text-neutral-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-neutral-500 dark:text-neutral-400">Failed to load analytics data.</p>
      </div>
    );
  }

  const formatStudyTime = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight dark:text-gray-100">Learning Analytics</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1">
          Track your study progress and performance
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="gradient-card-green border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <Brain className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.averagePercent}%</div>
                <p className="text-sm font-medium">Average Score</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-blue border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.totalMessages}</div>
                <p className="text-sm font-medium">Total Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-purple border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <Clock className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {formatStudyTime(data.overview.estimatedStudyMinutes)}
                </div>
                <p className="text-sm font-medium">Study Time</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-pink border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <FileCheck className="h-5 w-5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.totalSubmissions}</div>
                <p className="text-sm font-medium">Submissions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Weekly Activity</CardTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Messages per day (last 7 days)</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.weeklyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="day" fontSize={12} tickLine={false} />
                <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e5e5e5",
                    fontSize: "13px",
                  }}
                />
                <Bar dataKey="messages" fill="#737373" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Score History */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score History</CardTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Assignment scores over time</p>
          </CardHeader>
          <CardContent>
            {data.scoreHistory.length === 0 ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-neutral-400 dark:text-neutral-500">No graded submissions yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.scoreHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    dataKey="title"
                    fontSize={12}
                    tickLine={false}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e5e5",
                      fontSize: "13px",
                    }}
                    formatter={(value: number | undefined) => [`${value ?? 0}%`, "Score"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="percent"
                    stroke="#171717"
                    strokeWidth={2}
                    dot={{ fill: "#171717", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity Heatmap</CardTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Your feature usage over the past year — just like GitHub</p>
        </CardHeader>
        <CardContent>
          <ContributionGraph
            data={heatmapData}
            selectedDate={selectedDate}
            onSelectDate={handleSelectDate}
          />

          {/* Day Detail Panel */}
          {selectedDate && (
            <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                  </h4>
                  {dayActivities.length > 0 && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      {dayActivities.length} {dayActivities.length === 1 ? "activity" : "activities"}
                      {(() => {
                        const totalMs = dayActivities.reduce((sum, a) => sum + (a.durationMs || 0), 0);
                        return totalMs > 0 ? ` \u00b7 Total time: ${formatDuration(totalMs)}` : "";
                      })()}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setSelectedDate(null); setDayActivities([]); }}
                  className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <X className="h-4 w-4 text-gray-400" />
                </button>
              </div>
              <div className="max-h-[300px] overflow-y-auto">
                {loadingDetail ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : dayActivities.length === 0 ? (
                  <div className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
                    No activities on this day
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {dayActivities.map((activity) => (
                      <div key={activity.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                        <div className="shrink-0 w-[72px] text-right">
                          <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                            {new Date(activity.time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                          </span>
                        </div>
                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-700 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {CATEGORY_LABELS[activity.category] || activity.category}
                          </span>
                          {activity.detail && (
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 truncate">
                              \u2014 {activity.detail}
                            </span>
                          )}
                        </div>
                        {activity.durationMs != null && activity.durationMs > 0 && (
                          <span className="shrink-0 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full">
                            {formatDuration(activity.durationMs)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature Usage Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feature Usage Breakdown</CardTitle>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">How you spend your time across different features</p>
        </CardHeader>
        <CardContent>
          <ActivityBreakdown data={breakdownData} />
        </CardContent>
      </Card>
    </div>
  );
}
