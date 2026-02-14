"use client";

import React from "react";
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
import { CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/constants";

interface ActivityChartProps {
  dailyTrend: Record<string, string | number>[];
  trendCategories: string[];
  isDark: boolean;
}

export function ActivityChart({ dailyTrend, trendCategories, isDark }: ActivityChartProps) {
  const gridColor = isDark ? "#374151" : "#e5e7eb";
  const tickColor = isDark ? "#9ca3af" : "#6b7280";
  const tooltipBg = isDark ? "#1f2937" : "#ffffff";
  const tooltipBorder = isDark ? "#374151" : "#e5e7eb";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Daily Activity Trend</CardTitle>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Activity count by category over time
        </p>
      </CardHeader>
      <CardContent>
        {dailyTrend.every((d) => d.total === 0) ? (
          <div className="flex items-center justify-center h-[300px]">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              No activity in this period
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dailyTrend}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={gridColor}
                vertical={false}
              />
              <XAxis
                dataKey="label"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                tick={{ fill: tickColor }}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                tick={{ fill: tickColor }}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: "8px",
                  border: `1px solid ${tooltipBorder}`,
                  fontSize: "13px",
                  backgroundColor: tooltipBg,
                  color: isDark ? "#e5e7eb" : "#1f2937",
                }}
                formatter={(
                  value: number | undefined,
                  name: string | undefined
                ) => [
                  value ?? 0,
                  CATEGORY_LABELS[name || ""] || name || "",
                ]}
                cursor={{ fill: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }}
              />
              {trendCategories.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="1"
                  fill={CATEGORY_COLORS[cat] || "#94a3b8"}
                  radius={[0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}

        {trendCategories.length > 1 && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            {trendCategories.map((cat) => (
              <div key={cat} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{
                    backgroundColor: CATEGORY_COLORS[cat] || "#94a3b8",
                  }}
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
  );
}
