"use client";

import React from "react";
import {
  Loader2,
  ShieldAlert,
  Send,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ImageUpload } from "@/components/ui/image-upload";
import { formatShortDate } from "@/lib/utils";

export interface AppealMessageData {
  id: string;
  content: string;
  imageUrls?: string[];
  createdAt: string;
  user: { id: string; name: string | null; role: string };
}

export interface AppealData {
  id: string;
  status: string;
  reason: string;
  imageUrls?: string[];
  createdAt: string;
  student: { id: string; name: string | null };
  messages: AppealMessageData[];
}

interface AppealThreadProps {
  appeal: AppealData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Max points for the question this appeal is about */
  maxPoints: number;
  /** Current message draft for this appeal */
  message: string;
  onMessageChange: (value: string) => void;
  /** Current images for the reply */
  images: string[];
  onImagesChange: (images: string[]) => void;
  onUploadImage: (file: File) => Promise<string | null>;
  uploadingImage: boolean;
  /** New score input (string for controlled input) */
  newScore: string;
  onNewScoreChange: (value: string) => void;
  /** Whether this appeal is currently being resolved/rejected/reopened */
  resolving: boolean;
  onResolve: (status: "RESOLVED" | "REJECTED" | "OPEN") => void;
  onSendMessage: () => void;
  /** Whether to show the message preview (grading page uses it, assignment page does not) */
  showPreview?: boolean;
  /** The viewer role -- controls whether staff controls are shown */
  viewerRole?: "STUDENT" | "TA" | "PROFESSOR" | "ADMIN";
  /** Custom label for accept button */
  acceptLabel?: string;
  /** Custom label for deny button */
  denyLabel?: string;
}

export function AppealThread({
  appeal,
  isExpanded,
  onToggleExpand,
  maxPoints,
  message,
  onMessageChange,
  images,
  onImagesChange,
  onUploadImage,
  uploadingImage,
  newScore,
  onNewScoreChange,
  resolving,
  onResolve,
  onSendMessage,
  showPreview = false,
  viewerRole,
  acceptLabel = "Accept",
  denyLabel = "Deny",
}: AppealThreadProps) {
  const isStaffViewer =
    viewerRole === "TA" ||
    viewerRole === "ADMIN" ||
    viewerRole === "PROFESSOR";

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        appeal.status === "OPEN"
          ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/30"
          : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
      }`}
    >
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400" />
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Appeal by {appeal.student.name || "Student"}
          </span>
          <Badge
            className={`text-[10px] px-1.5 py-0 gap-0.5 ${
              appeal.status === "OPEN"
                ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900 dark:text-amber-400 dark:border-amber-700"
                : appeal.status === "RESOLVED"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900 dark:text-emerald-400 dark:border-emerald-700"
                  : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900 dark:text-red-400 dark:border-red-700"
            }`}
          >
            {appeal.status === "OPEN"
              ? "Pending"
              : appeal.status === "RESOLVED"
                ? "Accepted"
                : "Denied"}
          </Badge>
          {appeal.messages.length > 0 && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              {appeal.messages.length} message
              {appeal.messages.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <svg
          className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="space-y-2 pt-1">
          {/* Original reason */}
          <div className="bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-md p-2.5">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                {appeal.student.name || "Student"}
              </span>
              <span className="text-[10px] text-amber-500 dark:text-amber-600">
                {formatShortDate(appeal.createdAt)}
              </span>
            </div>
            <MarkdownContent
              content={appeal.reason}
              className="text-xs text-amber-800 dark:text-amber-300"
            />
            {appeal.imageUrls && appeal.imageUrls.length > 0 && (
              <div className="flex gap-2 mt-1.5 flex-wrap">
                {appeal.imageUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Attachment ${i + 1}`}
                      className="h-16 w-16 object-cover rounded border border-amber-200 dark:border-amber-700 hover:opacity-80 transition-opacity"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Messages */}
          {appeal.messages.map((msg) => {
            const isStaff =
              msg.user.role === "TA" ||
              msg.user.role === "ADMIN" ||
              msg.user.role === "PROFESSOR";
            return (
              <div
                key={msg.id}
                className={`rounded-md p-2.5 border ${
                  isStaff
                    ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800"
                    : "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span
                    className={`text-[10px] font-semibold ${
                      isStaff
                        ? "text-indigo-700 dark:text-indigo-400"
                        : "text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {msg.user.name || "User"}
                  </span>
                  {isStaff && (
                    <Badge className="text-[9px] px-1 py-0 bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-900 dark:text-indigo-400 dark:border-indigo-700">
                      {msg.user.role}
                    </Badge>
                  )}
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {formatShortDate(msg.createdAt)}
                  </span>
                </div>
                <MarkdownContent
                  content={msg.content}
                  className="text-xs text-gray-800 dark:text-gray-200"
                />
                {msg.imageUrls && msg.imageUrls.length > 0 && (
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {msg.imageUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Attachment ${i + 1}`}
                          className="h-16 w-16 object-cover rounded border border-gray-200 dark:border-gray-700 hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Reply + action controls */}
          <div className="space-y-2 pt-1 border-t border-gray-200 dark:border-gray-700">
            <Textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              placeholder={
                appeal.status === "OPEN"
                  ? "Reply or note before resolving... (supports LaTeX: $x^2$)"
                  : "Add a follow-up message... (supports LaTeX: $x^2$)"
              }
              rows={2}
              className="text-xs"
              onFocus={(e) => {
                const el = e.target;
                setTimeout(
                  () =>
                    el.scrollIntoView({ block: "center", behavior: "smooth" }),
                  350
                );
              }}
            />
            {showPreview && message?.trim() && (
              <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-2.5">
                <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mb-1">
                  Preview
                </p>
                <MarkdownContent
                  content={message}
                  className="text-xs text-gray-800 dark:text-gray-200"
                />
              </div>
            )}
            <ImageUpload
              images={images}
              onImagesChange={onImagesChange}
              onUpload={onUploadImage}
              uploading={uploadingImage}
              maxImages={3}
            />
            {appeal.status === "OPEN" && isStaffViewer && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max={maxPoints}
                  value={newScore}
                  onChange={(e) => onNewScoreChange(e.target.value)}
                  placeholder={`New score (max ${maxPoints})`}
                  className="w-40 text-xs"
                />
              </div>
            )}
            <div className="flex items-center gap-1.5">
              {isStaffViewer && appeal.status === "OPEN" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onResolve("RESOLVED")}
                    disabled={resolving}
                    className="gap-1 text-xs h-7 text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:text-emerald-400 dark:border-emerald-800 dark:hover:bg-emerald-950"
                  >
                    {resolving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {acceptLabel}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onResolve("REJECTED")}
                    disabled={resolving}
                    className="gap-1 text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
                  >
                    {resolving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <XCircle className="h-3 w-3" />
                    )}
                    {denyLabel}
                  </Button>
                </>
              ) : isStaffViewer && appeal.status !== "OPEN" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onResolve("OPEN")}
                  disabled={resolving}
                  className="gap-1 text-xs h-7 text-amber-600 border-amber-200 hover:bg-amber-50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-950"
                >
                  {resolving ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <ShieldAlert className="h-3 w-3" />
                  )}
                  Reopen
                </Button>
              ) : null}
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                onClick={onSendMessage}
                disabled={!message?.trim()}
                className="gap-1 text-xs h-7"
              >
                <Send className="h-3 w-3" />
                Reply
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
