"use client";

import React from "react";
import {
  Loader2,
  Trash2,
  Sparkles,
  ChevronDown,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface GeneratedProblem {
  id?: string;
  questionText: string;
  questionType: string;
  options?: string[];
  correctAnswer: string;
  solution: string;
  points: number;
  diagram?: { type: "svg" | "mermaid"; content: string } | unknown;
}

interface ProblemSet {
  id: string;
  topic: string;
  difficulty: number;
  questionType: string;
  createdBy: string;
  createdById: string;
  createdAt: string;
  problems: GeneratedProblem[];
}

interface ProblemBankProps {
  pastSets: ProblemSet[];
  showPast: boolean;
  loadingPast: boolean;
  selectedSetIds: Set<string>;
  deletingSetId: string | null;
  onToggleShow: () => void;
  onToggleSetSelection: (id: string) => void;
  onLoadProblemSet: (ps: ProblemSet) => void;
  onRequestDelete: (e: React.MouseEvent, id: string) => void;
  onMergeSelected: () => void;
  onClearSelection: () => void;
  canDeleteSet: (ps: ProblemSet) => boolean;
}

export function ProblemBank({
  pastSets,
  showPast,
  loadingPast,
  selectedSetIds,
  deletingSetId,
  onToggleShow,
  onToggleSetSelection,
  onLoadProblemSet,
  onRequestDelete,
  onMergeSelected,
  onClearSelection,
  canDeleteSet,
}: ProblemBankProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
      <button
        onClick={onToggleShow}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Problem Bank</h2>
          {pastSets.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">({pastSets.length} sets)</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${showPast ? "rotate-180" : ""}`} />
      </button>

      {showPast && selectedSetIds.size >= 2 && (
        <div className="px-6 py-3 bg-indigo-50 dark:bg-indigo-950 border-t border-b border-indigo-200 dark:border-indigo-800 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
            {selectedSetIds.size} sets selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              onClick={onClearSelection}
              size="sm"
              variant="outline"
              className="text-xs rounded-lg"
            >
              Clear
            </Button>
            <Button
              onClick={onMergeSelected}
              size="sm"
              className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs"
            >
              <Layers className="h-3.5 w-3.5" />
              Merge Selected
            </Button>
          </div>
        </div>
      )}

      {loadingPast && (
        <div className="px-6 py-8 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400 dark:text-gray-500 mx-auto" />
        </div>
      )}

      {showPast && pastSets.length === 0 && !loadingPast && (
        <div className="px-6 py-8 text-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">No saved problem sets yet. Generate some problems above!</p>
        </div>
      )}

      {showPast && pastSets.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {pastSets.map((ps) => (
            <div
              key={ps.id}
              className={`flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-50 dark:border-gray-800 last:border-b-0 ${
                selectedSetIds.has(ps.id) ? "bg-indigo-50/50 dark:bg-indigo-950/30" : ""
              }`}
            >
              <div className="flex items-center flex-1 min-w-0">
                <label
                  className="flex items-center pl-4 sm:pl-6 py-3 cursor-pointer shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={selectedSetIds.has(ps.id)}
                    onChange={() => onToggleSetSelection(ps.id)}
                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                  />
                </label>
                <button
                  onClick={() => onLoadProblemSet(ps)}
                  className="flex-1 px-3 py-3 text-left min-w-0"
                >
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{ps.topic}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {ps.problems.length} problems &middot; {ps.questionType} &middot; Difficulty {ps.difficulty}/5
                    {ps.createdBy && ` · by ${ps.createdBy}`}
                  </p>
                </button>
              </div>
              <div className="flex items-center gap-2 pr-4">
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {new Date(ps.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
                {canDeleteSet(ps) && (
                  <button
                    onClick={(e) => onRequestDelete(e, ps.id)}
                    disabled={deletingSetId === ps.id}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
                    title="Delete problem set"
                  >
                    {deletingSetId === ps.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
