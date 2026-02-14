"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";

interface BreakdownItem {
  label: string;
  count: number;
  totalMs: number;
  color: string;
}

interface UsageBreakdownProps {
  timeByCategory: { label: string; count: number; totalMs: number; color: string }[];
  timeByRole: { label: string; count: number; totalMs: number }[];
  breakdownView: "activity" | "identity";
  onBreakdownViewChange: (view: "activity" | "identity") => void;
}

export function UsageBreakdown({
  timeByCategory,
  timeByRole,
  breakdownView,
  onBreakdownViewChange,
}: UsageBreakdownProps) {
  const items: BreakdownItem[] =
    breakdownView === "activity"
      ? timeByCategory.map((d) => ({
          label: d.label,
          count: d.count,
          totalMs: d.totalMs,
          color: d.color,
        }))
      : timeByRole.map((d) => ({
          ...d,
          color: "#6366f1",
        }));

  const maxCount = Math.max(...items.map((d) => d.count), 1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Usage Breakdown</CardTitle>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              Activity count and time grouped by different dimensions
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {(
              [
                { key: "activity" as const, label: "Activity" },
                { key: "identity" as const, label: "Identity" },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => onBreakdownViewChange(f.key)}
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
        {items.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-neutral-400 dark:text-neutral-500">
              No data available
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-[140px] shrink-0">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {item.label}
                  </span>
                </div>
                <div className="flex-1 flex items-center gap-3">
                  <div className="flex-1 h-6 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max((item.count / maxCount) * 100, item.count > 0 ? 2 : 0)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                  <div className="w-[60px] text-right shrink-0">
                    <span className="text-sm font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                      {item.count}
                    </span>
                  </div>
                  <div className="w-[50px] text-right shrink-0">
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {item.totalMs > 0
                        ? formatDuration(item.totalMs)
                        : "--"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
