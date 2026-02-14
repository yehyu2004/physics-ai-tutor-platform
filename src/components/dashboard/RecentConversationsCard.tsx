"use client";

import React from "react";
import Link from "next/link";
import {
  MessageSquare,
  Sparkles,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { formatShortDate } from "@/lib/utils";

interface RecentConversation {
  id: string;
  title: string;
  updatedAt: string;
  lastMessage: string;
}

interface RecentConversationsCardProps {
  conversations: RecentConversation[];
}

export function RecentConversationsCard({ conversations }: RecentConversationsCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl sm:rounded-2xl shadow-sm animate-fade-in">
      <div className="flex items-center justify-between p-4 sm:p-6 pb-3 sm:pb-4">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
            <MessageSquare className="h-4 w-4 text-indigo-500" />
          </div>
          <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-gray-100">
            Recent Conversations
          </h3>
        </div>
        <Link
          href="/chat"
          className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium flex items-center gap-1 transition-colors"
        >
          View all <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="px-4 pb-4 sm:px-6 sm:pb-6">
        {conversations.length === 0 ? (
          <div className="py-8 text-center">
            <div className="flex justify-center gap-2 mb-4">
              <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-indigo-300 dark:text-indigo-600" />
              </div>
              <div className="h-10 w-10 rounded-full bg-violet-50 dark:bg-violet-950 flex items-center justify-center -ml-2">
                <Sparkles className="h-5 w-5 text-violet-300 dark:text-violet-600" />
              </div>
              <div className="h-10 w-10 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center -ml-2">
                <BookOpen className="h-5 w-5 text-indigo-300 dark:text-indigo-600" />
              </div>
            </div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              No conversations yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Start chatting with the AI tutor to get help with physics!
            </p>
            <Link
              href="/chat"
              className="inline-flex items-center gap-1.5 mt-4 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
            >
              Start your first conversation
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="Recent conversations">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/chat/${conv.id}`}
                className="flex items-start gap-3 py-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 -mx-2 px-2 rounded-lg transition-colors group first:pt-0"
              >
                <div className="h-8 w-8 rounded-full bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center shrink-0 mt-0.5">
                  <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-400 transition-colors">
                    {conv.title}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                    {conv.lastMessage}
                  </p>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 mt-0.5">
                  {formatShortDate(conv.updatedAt)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
