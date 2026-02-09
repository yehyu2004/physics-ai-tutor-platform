"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Brain, MessageSquare, Clock, FileCheck } from "lucide-react";
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

  useEffect(() => {
    fetch("/api/analytics")
      .then((res) => res.json())
      .then((json) => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-neutral-500">Failed to load analytics data.</p>
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
        <h1 className="text-2xl font-bold tracking-tight">Learning Analytics</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Track your study progress and performance
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="gradient-card-green border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <Brain className="h-5 w-5 text-neutral-700" />
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
                <MessageSquare className="h-5 w-5 text-neutral-700" />
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
                <Clock className="h-5 w-5 text-neutral-700" />
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
                <FileCheck className="h-5 w-5 text-neutral-700" />
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
            <p className="text-xs text-neutral-500">Messages per day (last 7 days)</p>
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
            <p className="text-xs text-neutral-500">Assignment scores over time</p>
          </CardHeader>
          <CardContent>
            {data.scoreHistory.length === 0 ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-neutral-400">No graded submissions yet</p>
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
    </div>
  );
}
