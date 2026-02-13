"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useTrackTime } from "@/lib/use-track-time";
import { useEffectiveSession } from "@/lib/effective-session-context";
import Link from "next/link";
import {
  Search,
  Play,
  ChevronRight,
  BookOpen,
  Atom,
  Zap,
  Flame,
  Eye,
  Sparkles,
  Waves,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { textbookParts, getAllSimulations } from "@/data/halliday-chapters";
import type { Part, Chapter } from "@/data/halliday-chapters";

const partIcons: Record<number, React.ElementType> = {
  1: Atom,       // Mechanics
  2: Waves,      // Waves
  3: Flame,      // Thermo
  4: Zap,        // E&M
  5: Eye,        // Optics
  6: Sparkles,   // Modern
};

export default function SimulationsClient() {
  useTrackTime("SIMULATION");
  const session = useEffectiveSession();
  const [examModeActive, setExamModeActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedPart, setExpandedPart] = useState<number | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);

  useEffect(() => {
    if (session?.role === "STUDENT") {
      fetch("/api/exam-mode")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => { if (data) setExamModeActive(data.isActive); })
        .catch((err) => console.error("[exam-mode] Failed to check exam mode:", err));
    }
  }, [session?.role]);

  const allSimulations = useMemo(() => getAllSimulations(), []);

  const filteredParts = useMemo(() => {
    if (!searchQuery.trim()) return textbookParts;

    const q = searchQuery.toLowerCase();
    return textbookParts
      .map((part) => ({
        ...part,
        chapters: part.chapters
          .map((chapter) => ({
            ...chapter,
            sections: chapter.sections.filter(
              (s) =>
                s.title.toLowerCase().includes(q) ||
                s.simulation?.title.toLowerCase().includes(q) ||
                chapter.title.toLowerCase().includes(q)
            ),
          }))
          .filter((ch) => ch.sections.length > 0 || ch.title.toLowerCase().includes(q)),
      }))
      .filter((p) => p.chapters.length > 0);
  }, [searchQuery]);

  const filteredSimulations = useMemo(() => {
    if (!searchQuery.trim()) return allSimulations;
    const q = searchQuery.toLowerCase();
    return allSimulations.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.part.toLowerCase().includes(q)
    );
  }, [searchQuery, allSimulations]);

  if (examModeActive && session?.role === "STUDENT") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
          <BookOpen className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Simulations Unavailable</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-md">
          Simulations are disabled during exam mode. Please focus on your exam. They will be available again once exam mode is turned off.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 dark:from-black dark:via-gray-950 dark:to-black">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-500/10 blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-emerald-500/5 blur-3xl" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="relative px-6 py-16 sm:px-8 lg:px-12">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                <BookOpen className="h-5 w-5 text-white" />
              </div>
              <span className="text-sm font-medium text-white/60 uppercase tracking-wider">
                Halliday, Resnick & Walker
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
              Physics Simulations
            </h1>
            <p className="text-lg text-white/60 max-w-2xl mb-8">
              Interactive visualizations for every major concept in Fundamentals
              of Physics. Explore, experiment, and build intuition.
            </p>

            {/* Search */}
            <div className="relative max-w-xl">
              <Search className="absolute left-4 top-3.5 h-5 w-5 text-white/40" />
              <Input
                placeholder="Search chapters, topics, or simulations..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 bg-white/10 backdrop-blur-sm border-white/10 text-white placeholder:text-white/40 rounded-xl text-base focus:bg-white/15 focus:border-white/20 focus:ring-white/10"
              />
            </div>

            {/* Quick stats */}
            <div className="flex items-center gap-6 mt-8 text-sm text-white/40">
              <span>
                <strong className="text-white/70">{textbookParts.length}</strong> parts
              </span>
              <span>
                <strong className="text-white/70">
                  {textbookParts.reduce((a, p) => a + p.chapters.length, 0)}
                </strong>{" "}
                chapters
              </span>
              <span className="flex items-center gap-1.5">
                <Play className="h-3.5 w-3.5 text-emerald-400" />
                <strong className="text-emerald-400">{allSimulations.length}</strong> interactive
                simulations
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-8 lg:px-12 py-10 max-w-7xl mx-auto">
        {/* Simulation Highlights */}
        {!searchQuery && (
          <div className="mb-12">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Featured Simulations
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              Jump straight into the most popular interactive experiences
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allSimulations.slice(0, 8).map((sim) => (
                <Link
                  key={sim.id}
                  href={`/simulations/${sim.id}`}
                  className="group relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 transition-all hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-black/30 hover:border-gray-300 dark:hover:border-gray-700 hover:-translate-y-0.5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10 dark:from-blue-500/20 dark:to-purple-500/20">
                      <Play className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      Ch. {sim.chapter}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1.5 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {sim.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                    {sim.description}
                  </p>
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search Results: Simulations */}
        {searchQuery && filteredSimulations.length > 0 && (
          <div className="mb-10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Matching Simulations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSimulations.map((sim) => (
                <Link
                  key={sim.id}
                  href={`/simulations/${sim.id}`}
                  className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 transition-all hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-700"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Play className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      {sim.part} — Ch. {sim.chapter}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {sim.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {sim.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Chapter Browser */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
            {searchQuery ? "Matching Chapters" : "Browse by Chapter"}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            Organized by Fundamentals of Physics, 12th Edition
          </p>

          <div className="space-y-4">
            {filteredParts.map((part) => {
              const Icon = partIcons[part.number] || Atom;
              const isExpanded = expandedPart === part.number || !!searchQuery;
              const simCount = part.chapters.reduce(
                (a, ch) => a + ch.sections.filter((s) => s.simulation).length,
                0
              );

              return (
                <div
                  key={part.number}
                  className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
                >
                  {/* Part Header */}
                  <button
                    onClick={() =>
                      setExpandedPart(isExpanded && !searchQuery ? null : part.number)
                    }
                    className="flex w-full items-center gap-4 p-5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${part.color} shadow-sm`}
                    >
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                          Part {part.number}
                        </span>
                        {simCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                            <Play className="h-2.5 w-2.5" />
                            {simCount}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {part.title}
                      </h3>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                      {part.chapters.length} chapters
                    </span>
                    <ChevronRight
                      className={`h-5 w-5 text-gray-400 transition-transform duration-200 ${
                        isExpanded ? "rotate-90" : ""
                      }`}
                    />
                  </button>

                  {/* Chapters */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {part.chapters.map((chapter) => (
                        <ChapterRow
                          key={chapter.number}
                          chapter={chapter}
                          part={part}
                          isExpanded={expandedChapter === chapter.number || !!searchQuery}
                          onToggle={() =>
                            setExpandedChapter(
                              expandedChapter === chapter.number && !searchQuery
                                ? null
                                : chapter.number
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {filteredParts.length === 0 && (
            <div className="text-center py-16">
              <Search className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                No results for &quot;{searchQuery}&quot;
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Try a different search term
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChapterRow({
  chapter,
  part,
  isExpanded,
  onToggle,
}: {
  chapter: Chapter;
  part: Part;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const hasSims = chapter.sections.some((s) => s.simulation);

  return (
    <div className="border-b border-gray-50 dark:border-gray-800/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"
      >
        <span className={`text-xs font-bold ${part.iconColor} min-w-[2rem]`}>
          {chapter.number}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">
          {chapter.title}
        </span>
        {hasSims && (
          <Play className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
        )}
        <ChevronRight
          className={`h-4 w-4 text-gray-400 transition-transform duration-200 shrink-0 ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
      </button>

      {isExpanded && (
        <div className="px-5 pb-3">
          <div className="ml-8 space-y-0.5">
            {chapter.sections.map((section) => (
              <div
                key={section.number}
                className="flex items-center gap-3 py-2 px-3 rounded-lg group"
              >
                <span className="text-xs text-gray-400 dark:text-gray-500 min-w-[2.5rem] font-mono">
                  {section.number}
                </span>
                <span className="flex-1 text-sm text-gray-600 dark:text-gray-400">
                  {section.title}
                </span>
                {section.simulation && (
                  <Link
                    href={`/simulations/${section.simulation.id}`}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Play className="h-3 w-3" />
                    Launch Sim
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
