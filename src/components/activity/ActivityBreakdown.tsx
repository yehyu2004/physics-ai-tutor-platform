"use client";

import React from "react";
import {
  MessageSquare,
  FileText,
  Upload,
  ClipboardList,
  FlaskConical,
  Sparkles,
  BarChart3,
  Settings,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface BreakdownItem {
  category: string;
  count: number;
  totalMs?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  if (minutes > 0) return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  return `${seconds}s`;
}

interface ActivityBreakdownProps {
  data: BreakdownItem[];
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  AI_CHAT: { label: "AI Chat", icon: MessageSquare, color: "#6366f1" },
  ASSIGNMENT_VIEW: { label: "View Assignments", icon: FileText, color: "#8b5cf6" },
  ASSIGNMENT_SUBMIT: { label: "Submit Work", icon: Upload, color: "#a78bfa" },
  GRADING: { label: "Grading", icon: ClipboardList, color: "#10b981" },
  SIMULATION: { label: "Simulations", icon: FlaskConical, color: "#f59e0b" },
  PROBLEM_GEN: { label: "Problem Gen", icon: Sparkles, color: "#ec4899" },
  ANALYTICS_VIEW: { label: "Analytics", icon: BarChart3, color: "#06b6d4" },
  ADMIN_ACTION: { label: "Admin", icon: Settings, color: "#64748b" },
};

export default function ActivityBreakdown({ data }: ActivityBreakdownProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  const chartData = data.map((d) => {
    const config = CATEGORY_CONFIG[d.category] || { label: d.category, color: "#94a3b8" };
    return {
      name: config.label,
      count: d.count,
      color: config.color,
      category: d.category,
      totalMs: d.totalMs || 0,
    };
  });

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
          <BarChart3 className="h-6 w-6 text-gray-400 dark:text-gray-500" />
        </div>
        <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No activity recorded yet</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start using features to see your breakdown</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Horizontal bar chart */}
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40 + 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis
            type="category"
            dataKey="name"
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
            formatter={(value: number | undefined) => [`${value ?? 0} times`, "Usage"]}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Legend list */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {chartData.map((item) => {
          const config = CATEGORY_CONFIG[item.category];
          const Icon = config?.icon || BarChart3;
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div
              key={item.category}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
            >
              <Icon className="h-4 w-4 shrink-0" style={{ color: item.color }} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{item.name}</p>
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  {item.count}x ({pct}%){item.totalMs > 0 ? ` · ${formatDuration(item.totalMs)}` : ""}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
