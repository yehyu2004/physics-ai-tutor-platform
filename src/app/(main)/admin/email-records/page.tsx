"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Loader2, Mail } from "lucide-react";
import { formatShortDate } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface EmailRecord {
  id: string;
  userId: string;
  userName: string | null;
  userEmail: string;
  action: string;
  details: {
    performedBy?: string;
    performedByName?: string;
    recipientIds?: string[];
    recipientCount?: number;
    subject?: string;
    message?: string;
    sentCount?: number;
    failedCount?: number;
  } | null;
  createdAt: string;
}

export default function EmailRecordsPage() {
  const [records, setRecords] = useState<EmailRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalCount, setTotalCount] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const fetchRecords = useCallback((p: number, ps: number) => {
    setLoading(true);
    fetch(`/api/admin/email-records?page=${p}&pageSize=${ps}`)
      .then((res) => res.json())
      .then((data) => {
        setRecords(data.records || []);
        setTotalCount(data.totalCount ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchRecords(page, pageSize);
  }, [page, pageSize, fetchRecords]);

  const handlePageSizeChange = (value: string) => {
    setPageSize(Number(value));
    setPage(1);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading email records...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Email Records
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          View history of all emails sent through PhysTutor ({totalCount} records)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Mail className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total Emails Sent
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{totalCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950">
              <Mail className="h-4 w-4 text-indigo-500" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Total Recipients
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {records.reduce((sum, r) => sum + (r.details?.recipientCount || r.details?.recipientIds?.length || 0), 0)}
          </p>
        </div>
      </div>

      {/* Records List */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">All Records</h2>
        </div>

        {records.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Mail className="h-8 w-8 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">No email records yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {records.map((record) => {
              const senderName = record.details?.performedByName || record.userName || "Unknown";
              const recipientCount = record.details?.recipientCount || (record.details?.recipientIds?.length || 0);
              const subject = record.details?.subject || "No subject";
              const message = record.details?.message || "";

              return (
                <details
                  key={record.id}
                  className="group hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <summary className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2 rounded-lg shrink-0 bg-indigo-50 dark:bg-indigo-950">
                        <Mail className="h-4 w-4 text-indigo-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {subject}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Sent by {senderName} to {recipientCount} recipient{recipientCount !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-11 sm:pl-0">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {formatShortDate(record.createdAt)}
                      </span>
                      {record.details?.sentCount != null && (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400">
                          {record.details.sentCount} sent
                          {record.details.failedCount ? `, ${record.details.failedCount} failed` : ""}
                        </span>
                      )}
                      <svg
                        className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-180 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </summary>
                  <div className="px-4 sm:px-6 pb-4 pt-1">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {message || "No message content"}
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span>Rows per page:</span>
            <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-20 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {totalPages > 1 && <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              &lt;
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
              .reduce<number[]>((acc, p) => {
                if (acc.length > 0 && p - acc[acc.length - 1] > 1) acc.push(-1);
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === -1 ? (
                  <span key={`gap-${i}`} className="px-2 text-sm text-gray-400">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      p === page
                        ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                        : "border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              &gt;
            </button>
          </div>}
        </div>
      )}
    </div>
  );
}
