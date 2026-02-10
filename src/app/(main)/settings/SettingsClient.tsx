"use client";

import React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

const themes = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export default function SettingsClient() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      <div className="pt-2 animate-fade-in">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="text-gray-400 mt-1">Customize your experience</p>
      </div>

      {/* Appearance Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-8 animate-fade-in">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          Appearance
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Choose your preferred color theme
        </p>

        <div className="grid grid-cols-3 gap-3">
          {themes.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={cn(
                "flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all",
                theme === value
                  ? "border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800"
                  : "border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              )}
            >
              <div
                className={cn(
                  "h-10 w-10 rounded-lg flex items-center justify-center",
                  theme === value
                    ? "bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  theme === value
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
