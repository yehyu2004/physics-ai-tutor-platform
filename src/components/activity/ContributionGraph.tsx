"use client";

import React, { useMemo, useState } from "react";

interface DayData {
  date: string;
  count: number;
}

interface ContributionGraphProps {
  data: DayData[];
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

const LEVEL_COLORS = [
  "bg-gray-100 dark:bg-gray-800",
  "bg-emerald-200 dark:bg-emerald-900",
  "bg-emerald-400 dark:bg-emerald-700",
  "bg-emerald-500 dark:bg-emerald-500",
  "bg-emerald-700 dark:bg-emerald-400",
];

export default function ContributionGraph({ data, selectedDate, onSelectDate }: ContributionGraphProps) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; date: string; count: number } | null>(null);

  const { weeks, monthLabels, totalActivities, longestStreak, currentStreak } = useMemo(() => {
    // Build a map for quick lookup
    const map = new Map<string, number>();
    let total = 0;
    for (const d of data) {
      map.set(d.date, d.count);
      total += d.count;
    }

    // Build weeks grid (columns = weeks, rows = days 0-6 Sun-Sat)
    // Use UTC methods to match server's toISOString()-based date keys
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayOfWeek = today.getUTCDay(); // 0=Sun

    // Start from the Sunday of 52 weeks ago
    const startDate = new Date(today);
    startDate.setUTCDate(startDate.getUTCDate() - (52 * 7 + dayOfWeek));

    const weeksArr: DayData[][] = [];
    const labels: { month: string; weekIndex: number }[] = [];
    let lastMonth = -1;

    const currentDate = new Date(startDate);
    let weekIndex = 0;

    while (currentDate <= today) {
      const week: DayData[] = [];
      for (let d = 0; d < 7; d++) {
        if (currentDate > today) {
          break;
        }
        const key = currentDate.toISOString().split("T")[0];
        const month = currentDate.getUTCMonth();
        if (month !== lastMonth) {
          labels.push({ month: MONTHS[month], weekIndex });
          lastMonth = month;
        }
        week.push({ date: key, count: map.get(key) || 0 });
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
      weeksArr.push(week);
      weekIndex++;
    }

    // Calculate streaks
    let longest = 0;
    let current = 0;
    let streak = 0;
    // Walk backwards from today
    const tempDate = new Date(today);
    for (let i = 0; i < 365; i++) {
      const key = tempDate.toISOString().split("T")[0];
      const count = map.get(key) || 0;
      if (count > 0) {
        streak++;
        if (i === 0 || current > 0) current = streak;
      } else {
        if (i === 0) current = 0;
        longest = Math.max(longest, streak);
        streak = 0;
      }
      tempDate.setUTCDate(tempDate.getUTCDate() - 1);
    }
    longest = Math.max(longest, streak);

    return {
      weeks: weeksArr,
      monthLabels: labels,
      totalActivities: total,
      longestStreak: longest,
      currentStreak: current,
    };
  }, [data]);

  const handleMouseEnter = (e: React.MouseEvent, day: DayData) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const parent = (e.target as HTMLElement).closest(".contribution-graph-container")?.getBoundingClientRect();
    if (parent) {
      setTooltip({
        x: rect.left - parent.left + rect.width / 2,
        y: rect.top - parent.top - 8,
        date: day.date,
        count: day.count,
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-sm">
        <div>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalActivities}</span>
          <span className="text-gray-500 dark:text-gray-400 ml-1.5">activities in the last year</span>
        </div>
        <div className="hidden sm:flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
          <span>Longest streak: <strong className="text-gray-700 dark:text-gray-300">{longestStreak} days</strong></span>
          <span>Current streak: <strong className="text-gray-700 dark:text-gray-300">{currentStreak} days</strong></span>
        </div>
      </div>

      {/* Graph */}
      <div className="contribution-graph-container relative overflow-x-auto pb-2">
        {/* Month labels */}
        <div className="flex text-[10px] text-gray-400 dark:text-gray-500 mb-1 ml-8">
          {monthLabels.map((label, i) => {
            const nextLabel = monthLabels[i + 1];
            const span = nextLabel ? nextLabel.weekIndex - label.weekIndex : weeks.length - label.weekIndex;
            if (span < 2) return null;
            return (
              <span
                key={`${label.month}-${label.weekIndex}`}
                style={{ width: `${span * 14}px` }}
                className="shrink-0"
              >
                {label.month}
              </span>
            );
          })}
        </div>

        <div className="flex gap-0">
          {/* Day labels */}
          <div className="flex flex-col gap-[2px] mr-1 text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
            <div className="h-[12px]" /> {/* empty for Sun */}
            <div className="h-[12px] flex items-center">Mon</div>
            <div className="h-[12px]" />
            <div className="h-[12px] flex items-center">Wed</div>
            <div className="h-[12px]" />
            <div className="h-[12px] flex items-center">Fri</div>
            <div className="h-[12px]" />
          </div>

          {/* Cells */}
          <div className="flex gap-[3px]">
            {weeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`w-[12px] h-[12px] rounded-[2px] transition-colors cursor-pointer ${
                      LEVEL_COLORS[getLevel(day.count)]
                    } hover:ring-1 hover:ring-gray-400 dark:hover:ring-gray-500${
                      selectedDate === day.date ? " ring-2 ring-indigo-500 dark:ring-indigo-400" : ""
                    }`}
                    onMouseEnter={(e) => handleMouseEnter(e, day)}
                    onMouseLeave={() => setTooltip(null)}
                    onClick={() => onSelectDate?.(day.date)}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-xs font-medium shadow-lg whitespace-nowrap"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: "translate(-50%, -100%)",
            }}
          >
            <span className="font-bold">{tooltip.count} {tooltip.count === 1 ? "activity" : "activities"}</span>
            {" "}on {formatDate(tooltip.date)}
            <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-100" />
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-end gap-1.5 mt-2 text-[10px] text-gray-400 dark:text-gray-500">
          <span>Less</span>
          {LEVEL_COLORS.map((color, i) => (
            <div key={i} className={`w-[12px] h-[12px] rounded-[2px] ${color}`} />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
