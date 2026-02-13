"use client";

import React from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/**
 * Shared pagination component with page number buttons and gap indicators.
 * Shows Previous/Next buttons, page numbers with "..." gaps for large page counts.
 */
export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
    .reduce<number[]>((acc, p) => {
      if (acc.length > 0 && p - acc[acc.length - 1] > 1) acc.push(-1);
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className={`flex items-center gap-1 ${className ?? ""}`}>
      <button
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage === 1}
        className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        &lt;
      </button>
      {pages.map((p, i) =>
        p === -1 ? (
          <span key={`gap-${i}`} className="px-2 text-sm text-neutral-400">...</span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              p === currentPage
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                : "border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        disabled={currentPage === totalPages}
        className="px-3 py-1.5 text-sm rounded-md border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        &gt;
      </button>
    </div>
  );
}
