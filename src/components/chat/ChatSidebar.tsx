"use client";

import React from "react";
import {
  Plus,
  MessageSquare,
  Trash2,
  Search,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Conversation } from "./types";

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface ChatSidebarProps {
  conversations: Conversation[];
  activeConversationId: string | null;
  conversationLimit: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string, e: React.MouseEvent) => void;
  confirmDeleteId: string | null;
  sidebarOpen: boolean;
  isMobile: boolean;
  onClose: () => void;
}

export function ChatSidebar({
  conversations,
  activeConversationId,
  conversationLimit,
  searchQuery,
  onSearchChange,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  confirmDeleteId,
  sidebarOpen,
  isMobile,
  onClose,
}: ChatSidebarProps) {
  const filteredConversations = conversations.filter((conv) =>
    conv.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {isMobile && (
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300",
            sidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          )}
          onClick={onClose}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          role="button"
          tabIndex={-1}
          aria-label="Close conversation sidebar"
        />
      )}

      <div
        className={cn(
          "bg-white dark:bg-gray-950 border-r border-gray-100 dark:border-gray-800 flex flex-col transition-all duration-300 overflow-hidden",
          isMobile
            ? cn("fixed inset-y-0 left-0 z-50 w-72 shadow-xl", sidebarOpen ? "translate-x-0" : "-translate-x-full")
            : cn("relative shrink-0", sidebarOpen ? "w-72" : "w-0 border-r-0")
        )}
      >
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900 dark:text-gray-100">Conversations</h2>
            <Button
              onClick={onNewChat}
              size="sm"
              disabled={conversations.length >= conversationLimit}
              title={conversations.length >= conversationLimit ? `Limit of ${conversationLimit} conversations reached. Delete old ones first.` : "New conversation"}
              className="h-7 gap-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" />
              New
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
            <Input
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search..."
              aria-label="Search conversations"
              className="pl-9 h-8 bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-800 rounded-lg text-sm focus-visible:ring-gray-300"
            />
          </div>
        </div>

        {conversations.length >= conversationLimit && (
          <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-xs text-amber-700 dark:text-amber-400">
            You&apos;ve reached the limit of {conversationLimit} conversations. Delete old ones to start new chats.
          </div>
        )}

        <div className="flex-1 overflow-y-auto" role="list" aria-label="Conversations">
          <div className="px-4 pb-2 space-y-0.5">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelectConversation(conv.id); }}
                aria-label={`Conversation: ${conv.title}`}
                aria-current={activeConversationId === conv.id ? "true" : undefined}
                className={cn(
                  "w-full text-left rounded-lg px-2 py-2 transition-all group cursor-pointer overflow-hidden",
                  activeConversationId === conv.id
                    ? "bg-gray-50 dark:bg-gray-800 font-semibold"
                    : "hover:bg-gray-50/50 dark:hover:bg-gray-800/50"
                )}
              >
                <div className="flex items-center gap-1">
                  <p
                    title={conv.title}
                    className={cn(
                      "text-sm truncate leading-tight min-w-0 flex-1",
                      activeConversationId === conv.id
                        ? "font-semibold text-gray-900 dark:text-gray-100"
                        : "font-normal text-gray-600 dark:text-gray-400"
                    )}
                  >
                    {conv.title}
                  </p>
                  <button
                    onClick={(e) => onDeleteConversation(conv.id, e)}
                    className={cn(
                      "shrink-0 p-1 rounded-md transition-all",
                      confirmDeleteId === conv.id
                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : "text-gray-400 dark:text-gray-500 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400"
                    )}
                    title={confirmDeleteId === conv.id ? "Click again to confirm" : "Delete conversation"}
                  >
                    {confirmDeleteId === conv.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {formatRelativeDate(conv.updatedAt)}
                </p>
              </div>
            ))}
            {filteredConversations.length === 0 && (
              <div className="text-center py-8 px-4">
                <MessageSquare className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400 dark:text-gray-500">
                  {searchQuery ? "No matching conversations" : "No conversations yet"}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 mt-1 underline"
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
