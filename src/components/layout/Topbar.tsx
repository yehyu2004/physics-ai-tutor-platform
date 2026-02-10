"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LogOut,
  Bell,
  ChevronRight,
  User,
  Settings,
  Megaphone,
  CheckCheck,
  Loader2,
  Pencil,
  Trash2,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface TopbarProps {
  userName: string;
  userEmail: string;
  userImage?: string;
  userRole: string;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  createdByName: string | null;
  createdAt: string;
  isRead: boolean;
}

const routeLabels: Record<string, string> = {
  "/dashboard": "Home",
  "/chat": "AI Chat",
  "/assignments": "Assignments",
  "/assignments/create": "Create Assignment",
  "/grades": "Grades",
  "/problems/generate": "Problem Generator",
  "/grading": "Grading",
  "/admin/users": "Users",
  "/admin/qa-history": "Q&A History",
  "/admin/settings": "Settings",
  "/profile": "Profile",
  "/settings": "Settings",
};

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Topbar({ userName, userEmail, userImage, userRole }: TopbarProps) {
  const pathname = usePathname();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const [examModeActive, setExamModeActive] = useState(false);
  const [examModeMessage, setExamModeMessage] = useState<string | null>(null);
  const [examTooltipOpen, setExamTooltipOpen] = useState(false);
  const [examToggling, setExamToggling] = useState(false);

  const isStaff = userRole === "TA" || userRole === "ADMIN";

  const fetchExamMode = useCallback(async () => {
    try {
      const res = await fetch("/api/exam-mode");
      if (res.ok) {
        const data = await res.json();
        setExamModeActive(data.isActive);
        setExamModeMessage(data.message);
      }
    } catch {
      // silently ignore
    }
  }, []);

  const toggleExamMode = async () => {
    setExamToggling(true);
    try {
      const res = await fetch("/api/exam-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !examModeActive }),
      });
      if (res.ok) {
        const data = await res.json();
        setExamModeActive(data.isActive);
        setExamModeMessage(data.message);
      }
    } finally {
      setExamToggling(false);
    }
  };

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchExamMode();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchExamMode();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications, fetchExamMode]);

  const handleDropdownOpen = (open: boolean) => {
    setNotifOpen(open);
    if (open) fetchNotifications();
  };

  const markAsRead = async (id: string) => {
    await fetch(`/api/notifications/${id}/read`, { method: "POST" });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setTitle("");
    setMessage("");
    setNotifOpen(false);
    setDialogOpen(true);
  };

  const openEditDialog = (n: NotificationItem) => {
    setEditingId(n.id);
    setTitle(n.title);
    setMessage(n.message);
    setNotifOpen(false);
    setDialogOpen(true);
  };

  const handleSend = async () => {
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const url = editingId
        ? `/api/notifications/${editingId}`
        : "/api/notifications";
      const method = editingId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), message: message.trim() }),
      });
      if (res.ok) {
        setTitle("");
        setMessage("");
        setEditingId(null);
        setDialogOpen(false);
        fetchNotifications();
      }
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
    if (res.ok) {
      fetchNotifications();
    }
  };

  const getBreadcrumbs = () => {
    const segments = pathname.split("/").filter(Boolean);
    const crumbs: { label: string; href: string }[] = [];

    let currentPath = "";
    for (const segment of segments) {
      currentPath += `/${segment}`;
      // Skip segments that look like database IDs (cuid, uuid, etc.)
      if (/^[a-z0-9]{20,}$/i.test(segment) || /^[0-9a-f]{8}-/.test(segment)) continue;
      const label = routeLabels[currentPath] || segment.charAt(0).toUpperCase() + segment.slice(1);
      crumbs.push({ label, href: currentPath });
    }

    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 px-4 sm:px-6">
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1 text-sm min-w-0">
            <Link
              href="/dashboard"
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0 hidden sm:inline"
            >
              PhysTutor
            </Link>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={crumb.href}>
                <ChevronRight className={`h-3.5 w-3.5 text-gray-300 dark:text-gray-600 shrink-0 ${i === 0 ? 'hidden sm:block' : ''}`} />
                {i === breadcrumbs.length - 1 ? (
                  <span className="text-gray-900 dark:text-gray-100 font-medium truncate">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors shrink-0"
                  >
                    {crumb.label}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Exam Mode Badge */}
          {examModeActive && (
            <div className="relative">
              <button
                onClick={() => {
                  if (isStaff) {
                    toggleExamMode();
                  } else {
                    setExamTooltipOpen(!examTooltipOpen);
                  }
                }}
                disabled={examToggling}
                className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                title="Exam Mode Active"
              >
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Exam Mode</span>
                {isStaff && (
                  <span className="hidden sm:inline text-[10px] text-red-400 ml-0.5">(click to turn off)</span>
                )}
              </button>
              {examTooltipOpen && !isStaff && (
                <div className="absolute top-full right-0 mt-1.5 w-64 bg-white rounded-lg border border-gray-200 shadow-lg p-3 z-50">
                  <p className="text-sm font-medium text-gray-900 mb-1">Exam Mode is Active</p>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {examModeMessage || "An exam is in progress. The AI tutor will provide guidance and help you understand concepts, but will not give direct answers to problems."}
                  </p>
                  <button
                    onClick={() => setExamTooltipOpen(false)}
                    className="mt-2 text-xs text-gray-400 hover:text-gray-600"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Exam Mode Toggle for Staff (when not active) */}
          {!examModeActive && isStaff && (
            <button
              onClick={toggleExamMode}
              disabled={examToggling}
              className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium hover:bg-gray-100 hover:text-gray-700 transition-colors disabled:opacity-50"
              title="Enable Exam Mode"
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Exam Mode</span>
            </button>
          )}

          <DropdownMenu open={notifOpen} onOpenChange={handleDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative rounded-lg h-8 w-8 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Bell className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white ring-2 ring-white dark:ring-gray-950">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-80 rounded-lg p-0" align="end" sideOffset={8}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</span>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-gray-500 hover:text-gray-700"
                      onClick={(e) => {
                        e.preventDefault();
                        markAllRead();
                      }}
                    >
                      <CheckCheck className="h-3.5 w-3.5 mr-1" />
                      Mark all read
                    </Button>
                  )}
                </div>
              </div>

              {isStaff && (
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={(e) => {
                      e.preventDefault();
                      openCreateDialog();
                    }}
                  >
                    <Megaphone className="h-3.5 w-3.5 mr-1.5" />
                    New Announcement
                  </Button>
                </div>
              )}

              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">
                    No notifications yet
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className="flex items-start gap-2 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        if (!n.isRead) markAsRead(n.id);
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex w-full items-start justify-between gap-2">
                          <span
                            className={`text-sm leading-tight ${
                              n.isRead ? "text-gray-600" : "font-semibold text-gray-900"
                            }`}
                          >
                            {n.title}
                          </span>
                          {!n.isRead && (
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <span className="text-xs text-gray-500 line-clamp-2 leading-relaxed block">
                          {n.message}
                        </span>
                        <span className="text-[11px] text-gray-400 mt-0.5 block">
                          {n.createdByName && `${n.createdByName} · `}
                          {timeAgo(n.createdAt)}
                        </span>
                      </div>
                      {isStaff && (
                        <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                          <button
                            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditDialog(n);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(n.id);
                            }}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="relative flex items-center gap-2 rounded-lg pl-2 pr-3 h-9 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Avatar className="h-7 w-7">
                  <AvatarImage src={userImage} alt={userName} />
                  <AvatarFallback className="text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                    {userName?.[0]?.toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:flex flex-col items-start">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {userName}
                  </span>
                </div>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400 rotate-90" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-lg p-1.5" align="end" sideOffset={8}>
              <DropdownMenuLabel className="font-normal px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={userImage} alt={userName} />
                    <AvatarFallback className="text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                      {userName?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{userName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{userEmail}</p>
                    <span className="mt-0.5 inline-flex items-center rounded-md bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide w-fit">
                      {userRole}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="my-1" />
              <Link href="/profile">
                <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  <User className="mr-2.5 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
              </Link>
              <Link href="/settings">
                <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
                  <Settings className="mr-2.5 h-4 w-4" />
                  Settings
                </DropdownMenuItem>
              </Link>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                className="cursor-pointer rounded-md px-3 py-2 text-sm text-red-600 focus:text-red-600 focus:bg-red-50 transition-colors"
                onClick={() => signOut({ callbackUrl: "/login" })}
              >
                <LogOut className="mr-2.5 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Announcement" : "New Announcement"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="notif-title">Title</Label>
              <Input
                id="notif-title"
                placeholder="e.g. Exam reminder"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notif-message">Message</Label>
              <Textarea
                id="notif-message"
                placeholder="Write your announcement..."
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !title.trim() || !message.trim()}
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  {editingId ? "Saving..." : "Sending..."}
                </>
              ) : (
                editingId ? "Save Changes" : "Send to All"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
