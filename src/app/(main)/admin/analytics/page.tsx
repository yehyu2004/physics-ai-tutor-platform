"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Users, MessageSquare, Mail, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AdminAnalyticsData {
  overview: {
    totalUsers: number;
    totalConversations: number;
    totalMessages: number;
    totalSubmissions: number;
  };
  dailyActivity: { date: string; day: string; messages: number }[];
  scoreDistribution: { range: string; count: number }[];
  assignmentAvgs: { title: string; avgPercent: number; submissions: number }[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AdminAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics")
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin Analytics</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Platform-wide usage and performance overview
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="gradient-card-purple border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <Users className="h-5 w-5 text-neutral-700" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.totalUsers}</div>
                <p className="text-sm font-medium">Total Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-pink border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-neutral-700" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.totalConversations}</div>
                <p className="text-sm font-medium">Conversations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-blue border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <Mail className="h-5 w-5 text-neutral-700" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.totalMessages}</div>
                <p className="text-sm font-medium">Messages</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="gradient-card-green border-0">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-white/60 flex items-center justify-center">
                <FileText className="h-5 w-5 text-neutral-700" />
              </div>
              <div>
                <div className="text-2xl font-bold">{data.overview.totalSubmissions}</div>
                <p className="text-sm font-medium">Submissions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Daily Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Activity</CardTitle>
          <p className="text-xs text-neutral-500">Messages per day (last 14 days)</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.dailyActivity}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="day" fontSize={11} tickLine={false} angle={-30} textAnchor="end" height={60} />
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

      {/* Score Distribution & Assignment Averages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Distribution</CardTitle>
            <p className="text-xs text-neutral-500">Number of submissions per score range</p>
          </CardHeader>
          <CardContent>
            {data.scoreDistribution.every((d) => d.count === 0) ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-neutral-400">No graded submissions yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.scoreDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="range" fontSize={12} tickLine={false} />
                  <YAxis fontSize={12} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e5e5",
                      fontSize: "13px",
                    }}
                  />
                  <Bar dataKey="count" fill="#525252" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assignment Averages</CardTitle>
            <p className="text-xs text-neutral-500">Sorted by average score (lowest first)</p>
          </CardHeader>
          <CardContent>
            {data.assignmentAvgs.length === 0 ? (
              <div className="flex items-center justify-center h-[300px]">
                <p className="text-sm text-neutral-400">No assignment data yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.assignmentAvgs} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis
                    type="number"
                    fontSize={12}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    dataKey="title"
                    type="category"
                    fontSize={11}
                    tickLine={false}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid #e5e5e5",
                      fontSize: "13px",
                    }}
                    formatter={(value: number | undefined) => [`${value ?? 0}%`, "Avg Score"]}
                  />
                  <Bar dataKey="avgPercent" fill="#404040" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
