"use client";

import React from "react";
import {
  Bell,
  CheckCheck,
  Megaphone,
  Pencil,
  Trash2,
  CircleDot,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdByName: string | null;
  createdAt: string;
  isRead: boolean;
}

interface ScheduledNotificationItem {
  id: string;
  title: string;
  message: string;
  createdByName: string | null;
  createdAt: string;
  isRead: boolean;
  isScheduled: boolean;
  scheduledAt: string;
  hasEmail: boolean;
}

interface NotificationDropdownProps {
  notifications: NotificationItem[];
  scheduledNotifications: ScheduledNotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  notifTab: "notifications" | "scheduled";
  onTabChange: (tab: "notifications" | "scheduled") => void;
  isStaff: boolean;
  onMarkAsRead: (id: string) => void;
  onMarkAsUnread: (id: string) => void;
  onMarkAllRead: () => void;
  onCreateAnnouncement: () => void;
  onEdit: (n: NotificationItem) => void;
  onDelete: (id: string) => void;
}

export function NotificationDropdown({
  notifications,
  scheduledNotifications,
  unreadCount,
  isOpen,
  onOpenChange,
  notifTab,
  onTabChange,
  isStaff,
  onMarkAsRead,
  onMarkAsUnread,
  onMarkAllRead,
  onCreateAnnouncement,
  onEdit,
  onDelete,
}: NotificationDropdownProps) {
  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-lg h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          {unreadCount > 0 && (
            <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white ring-2 ring-white dark:ring-gray-950">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[calc(100vw-2rem)] sm:w-80 rounded-lg p-0" align="end" sideOffset={8} collisionPadding={16}>
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                onClick={(e) => {
                  e.preventDefault();
                  onMarkAllRead();
                }}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        </div>

        {isStaff && (
          <div className="flex items-center border-b border-gray-100 dark:border-gray-800">
            <button
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                notifTab === "notifications"
                  ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              onClick={(e) => { e.preventDefault(); onTabChange("notifications"); }}
            >
              Notifications{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </button>
            <button
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                notifTab === "scheduled"
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
              onClick={(e) => { e.preventDefault(); onTabChange("scheduled"); }}
            >
              Scheduled{scheduledNotifications.length > 0 ? ` (${scheduledNotifications.length})` : ""}
            </button>
          </div>
        )}

        {isStaff && notifTab === "notifications" && (
          <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={(e) => {
                e.preventDefault();
                onCreateAnnouncement();
              }}
            >
              <Megaphone className="h-3.5 w-3.5 mr-1.5" />
              New Announcement
            </Button>
          </div>
        )}

        <div className="max-h-[60vh] sm:max-h-80 overflow-y-auto" role="list" aria-label="Notifications">
          {isStaff && notifTab === "scheduled" && (
            scheduledNotifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                No scheduled publishes
              </div>
            ) : (
              scheduledNotifications.map((sn) => (
                <div
                  key={sn.id}
                  role="listitem"
                  className="flex items-start gap-3 px-3 sm:px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0"
                >
                  <div className="mt-0.5 h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm leading-tight text-gray-800 dark:text-gray-200 font-medium block">
                      {sn.title}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-1 block mt-0.5">
                      {sn.message}
                    </span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                        {new Date(sn.scheduledAt).toLocaleString("en-US", {
                          month: "short", day: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                      </span>
                      {sn.hasEmail && (
                        <span className="text-[9px] bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-medium">
                          + email
                        </span>
                      )}
                      {sn.createdByName && (
                        <span className="text-[11px] text-gray-400 dark:text-gray-500">
                          by {sn.createdByName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {(notifTab === "notifications" || !isStaff) && (notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                role="listitem"
                className="flex items-start gap-2 px-3 sm:px-4 py-2.5 sm:py-3 border-b border-gray-50 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                onClick={() => {
                  if (!n.isRead) onMarkAsRead(n.id);
                }}
                onKeyDown={(e) => {
                  if ((e.key === "Enter" || e.key === " ") && !n.isRead) {
                    e.preventDefault();
                    onMarkAsRead(n.id);
                  }
                }}
                tabIndex={0}
                aria-label={`${n.isRead ? "" : "Unread: "}${n.title}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex w-full items-start justify-between gap-2">
                    <span
                      className={`text-sm leading-tight ${
                        n.isRead ? "text-gray-600 dark:text-gray-400" : "font-semibold text-gray-900 dark:text-gray-100"
                      }`}
                    >
                      {n.title}
                    </span>
                    {!n.isRead && (
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed block">
                    {n.message}
                  </span>
                  <span className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 block">
                    {n.createdByName && `${n.createdByName} · `}
                    {new Date(n.createdAt).toLocaleString("en-US", {
                      month: "short", day: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                  {n.isRead && (
                    <button
                      className="p-1.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkAsUnread(n.id);
                      }}
                      title="Mark as unread"
                    >
                      <CircleDot className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isStaff && (
                    <>
                      <button
                        className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit(n);
                        }}
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(n.id);
                        }}
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
