"use client";

import React, { useState, useEffect } from "react";
import {
  Loader2,
  Mail,
  Send,
  SkipForward,
  CheckCircle2,
  Clock,
  CalendarClock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface NotifyUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isBanned: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  message: string;
  category: string;
}

interface NotifyUsersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSubject: string;
  defaultMessage: string;
  onSkip?: (scheduledAt?: string) => void | Promise<void>;
  onSent?: () => void;
  /** Called before sending emails. Use to create a notification, etc. Returns optional assignmentId. */
  onBeforeSend?: (subject: string, message: string, scheduledAt?: string) => Promise<string | void>;
  /** Override dialog title (default: "Notify Users") */
  dialogTitle?: string;
  /** Override dialog description */
  dialogDescription?: string;
  /** Override send button label (default: "Send Reminder") */
  sendButtonLabel?: string;
  /** Override skip button label (default: "Skip") */
  skipButtonLabel?: string;
  /** Override success message (default: "Reminder sent successfully") */
  successMessage?: string;
  /** Enable scheduling option (default: true) */
  enableScheduling?: boolean;
  /** Pre-fill the scheduled time and auto-enable schedule mode */
  defaultScheduledAt?: string;
  /** Link the scheduled email to an assignment (publishes after email sends) */
  assignmentId?: string;
  /** Called when a scheduled email is created successfully */
  onScheduled?: () => void;
  /** Schedule publish mode: shows datetime picker, always schedules email+notification */
  schedulePublishMode?: boolean;
}

const ROLES = ["STUDENT", "TA", "PROFESSOR", "ADMIN"] as const;
const ROLE_LABELS: Record<string, string> = {
  STUDENT: "Students",
  TA: "TAs",
  PROFESSOR: "Professors",
  ADMIN: "Admins",
};
const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  PROFESSOR: "bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-300",
  TA: "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300",
  STUDENT: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300",
};

export function NotifyUsersDialog({
  open,
  onOpenChange,
  defaultSubject,
  defaultMessage,
  onSkip,
  onSent,
  onBeforeSend,
  dialogTitle = "Notify Users",
  dialogDescription = "Send an email notification to selected users. Filter by role or select individually.",
  sendButtonLabel = "Send Reminder",
  skipButtonLabel = "Skip",
  successMessage = "Reminder sent successfully",
  enableScheduling = true,
  defaultScheduledAt,
  assignmentId,
  onScheduled,
  schedulePublishMode = false,
}: NotifyUsersDialogProps) {
  const [users, setUsers] = useState<NotifyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [alsoEmail, setAlsoEmail] = useState(schedulePublishMode);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [successMsg, setSuccessMsg] = useState(successMessage);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Fetch users when dialog opens
  useEffect(() => {
    if (!open) {
      setSuccess(false);
      return;
    }
    setSubject(defaultSubject);
    setMessage(defaultMessage);
    setRoleFilter("ALL");
    setScheduleMode(!!defaultScheduledAt);
    setScheduledAt(defaultScheduledAt || "");
    setAlsoEmail(!!defaultScheduledAt || schedulePublishMode);
    setSuccessMsg(successMessage);
    setLoading(true);

    // Fetch templates
    setLoadingTemplates(true);
    fetch("/api/admin/email-templates")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setTemplates(data.templates || []))
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTemplates(false));

    fetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const eligible = (data.users || []).filter(
          (u: NotifyUser) => !u.isBanned
        );
        setUsers(eligible);
        // Pre-select all users
        setSelected(new Set(eligible.map((u: NotifyUser) => u.id)));
      })
      .catch(() => {
        setUsers([]);
      })
      .finally(() => setLoading(false));
  }, [open, defaultSubject, defaultMessage, defaultScheduledAt]);

  const filteredUsers =
    roleFilter === "ALL" ? users : users.filter((u) => u.role === roleFilter);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) return;
    if (selected.size === 0) return;

    // Schedule publish mode
    if (schedulePublishMode) {
      if (!scheduledAt) return;
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
      setSending(true);
      try {
        let effectiveAssignmentId = assignmentId;
        if (onBeforeSend) {
          const returnedId = await onBeforeSend(subject.trim(), message.trim(), scheduledAt);
          if (returnedId) effectiveAssignmentId = returnedId;
        }
        // Always create a scheduled notification; include email recipients only if "Also send as email" is checked
        const res = await fetch("/api/admin/scheduled-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: subject.trim(),
            message: message.trim(),
            scheduledAt: scheduledDate.toISOString(),
            recipientIds: alsoEmail ? Array.from(selected) : [],
            createNotification: true,
            ...(effectiveAssignmentId ? { assignmentId: effectiveAssignmentId } : {}),
          }),
        });
        if (!res.ok) {
          toast.error("Failed to schedule");
          return;
        }

        setSuccessMsg(`Scheduled for ${scheduledDate.toLocaleString()}`);
        setSuccess(true);
        setTimeout(() => {
          onOpenChange(false);
          onScheduled?.();
          onSent?.();
        }, 1500);
      } catch {
        toast.error("Failed to schedule");
      } finally {
        setSending(false);
      }
      return;
    }

    setSending(true);
    try {
      // Schedule mode: create a scheduled email instead of sending now
      if (scheduleMode && alsoEmail) {
        if (!scheduledAt) return;
        const scheduledDate = new Date(scheduledAt);
        if (scheduledDate <= new Date()) return;

        // Run pre-send action (e.g. create in-app notification immediately)
        if (onBeforeSend) {
          await onBeforeSend(subject.trim(), message.trim());
        }

        const res = await fetch("/api/admin/scheduled-emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: subject.trim(),
            message: message.trim(),
            scheduledAt: scheduledDate.toISOString(),
            recipientIds: Array.from(selected),
            createNotification: !onBeforeSend, // create notification on send if no onBeforeSend handler
            ...(assignmentId ? { assignmentId } : {}),
          }),
        });
        if (res.ok) {
          setSuccessMsg(`Email scheduled for ${scheduledDate.toLocaleString()}`);
          setSuccess(true);
          setTimeout(() => {
            onOpenChange(false);
            onScheduled?.();
            onSent?.();
          }, 1500);
          return;
        }
      } else {
        // Run pre-send action (e.g. create notification)
        if (onBeforeSend) {
          await onBeforeSend(subject.trim(), message.trim());
        }

        if (alsoEmail && selected.size > 0) {
          const res = await fetch("/api/admin/email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userIds: Array.from(selected),
              subject: subject.trim(),
              message: message.trim(),
            }),
          });
          if (res.ok) {
            setSuccess(true);
            setTimeout(() => {
              onOpenChange(false);
              onSent?.();
            }, 1500);
            return;
          }
        } else {
          setSuccess(true);
          setTimeout(() => {
            onOpenChange(false);
            onSent?.();
          }, 1500);
          return;
        }
      }
    } catch {
      // non-critical
    } finally {
      setSending(false);
    }
    onOpenChange(false);
    onSent?.();
  };

  const handleSkip = async () => {
    if (schedulePublishMode) {
      if (!scheduledAt) {
        toast.error("Please select a scheduled time");
        return;
      }
      const scheduledDate = new Date(scheduledAt);
      if (scheduledDate <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }
    if (schedulePublishMode && scheduledAt) {
      await onSkip?.(scheduledAt);
    } else {
      await onSkip?.();
    }
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!sending) {
          onOpenChange(o);
        }
      }}
    >
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-500" />
            {dialogTitle}
          </DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {successMsg}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Schedule publish datetime picker */}
              {schedulePublishMode && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <CalendarClock className="h-3.5 w-3.5 text-blue-500" />
                    Publish Date & Time
                  </Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    lang="en-US"
                  />
                  {scheduledAt && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Will publish on {new Date(scheduledAt).toLocaleString("en-US", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
              )}

              {/* Recipients header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Recipients ({selected.size} of {users.length} selected)
                </span>
                <button
                  type="button"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  onClick={() => {
                    if (selected.size === users.length) {
                      setSelected(new Set());
                    } else {
                      setSelected(new Set(users.map((u) => u.id)));
                    }
                  }}
                >
                  {selected.size === users.length ? "Deselect All" : "Select All"}
                </button>
              </div>

              {/* Role filter tabs */}
              <div className="flex flex-wrap gap-1.5">
                {/* All tab */}
                <button
                  type="button"
                  onClick={() => setRoleFilter("ALL")}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    roleFilter === "ALL"
                      ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                  }`}
                >
                  All ({users.length})
                </button>
                {ROLES.map((role) => {
                  const count = users.filter((u) => u.role === role).length;
                  if (count === 0) return null;
                  const isActive = roleFilter === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setRoleFilter(role)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-800"
                      }`}
                    >
                      {ROLE_LABELS[role]} ({count})
                    </button>
                  );
                })}
              </div>

              {/* User list */}
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="border rounded-lg divide-y dark:border-gray-700 dark:divide-gray-700 max-h-[200px] overflow-y-auto">
                  {filteredUsers.map((user) => (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(user.id)}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(user.id)) next.delete(user.id);
                            else next.add(user.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 shrink-0"
                      />
                      <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
                        {user.name || "Unknown"}
                      </span>
                      <span
                        className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                          ROLE_COLORS[user.role] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {user.role}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500 truncate ml-auto">
                        {user.email}
                      </span>
                    </label>
                  ))}
                  {filteredUsers.length === 0 && (
                    <div className="px-3 py-4 text-sm text-gray-400 text-center">
                      {loading ? "Loading users..." : "No users found"}
                    </div>
                  )}
                </div>
              )}

              {/* Also send email toggle */}
              <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alsoEmail}
                    onChange={(e) => setAlsoEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800"
                  />
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Also send as email</span>
                  </div>
                </label>

              {!schedulePublishMode && alsoEmail && (
              <>
              {/* Pre-set schedule time (read-only) */}
              {scheduleMode && defaultScheduledAt && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span>Email will be sent on {new Date(defaultScheduledAt).toLocaleString("en-US", {
                    weekday: "long", year: "numeric", month: "long", day: "numeric",
                    hour: "numeric", minute: "2-digit",
                  })}</span>
                </div>
              )}

              {/* Schedule datetime picker (manual) */}
              {scheduleMode && enableScheduling && !defaultScheduledAt && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Send at
                  </Label>
                  <input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    min={new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500">Emails will be sent within 5 minutes of the scheduled time.</p>
                </div>
              )}
              </>
              )}

              {/* Template picker */}
              {templates.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    Use Template
                  </Label>
                  <select
                    onChange={(e) => {
                      const tmpl = templates.find((t) => t.id === e.target.value);
                      if (tmpl) {
                        setSubject(tmpl.subject);
                        setMessage(tmpl.message);
                      }
                      e.target.value = "";
                    }}
                    defaultValue=""
                    disabled={loadingTemplates}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="" disabled>
                      {loadingTemplates ? "Loading templates..." : "Select a template..."}
                    </option>
                    {["announcement", "assignment", "grade", "reminder", "general"].map((cat) => {
                      const catTemplates = templates.filter((t) => t.category === cat);
                      if (catTemplates.length === 0) return null;
                      return (
                        <optgroup key={cat} label={cat.charAt(0).toUpperCase() + cat.slice(1)}>
                          {catTemplates.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                </div>
              )}

              {/* Subject */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Subject</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Message</Label>
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="resize-none text-sm"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              {onSkip && (
                <Button
                  variant="outline"
                  onClick={handleSkip}
                  disabled={sending}
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  {skipButtonLabel}
                </Button>
              )}
              <Button
                onClick={handleSend}
                disabled={
                  sending ||
                  selected.size === 0 ||
                  !subject.trim() ||
                  !message.trim() ||
                  (scheduleMode && alsoEmail && !scheduledAt) ||
                  (schedulePublishMode && !scheduledAt)
                }
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : schedulePublishMode || (scheduleMode && alsoEmail) ? (
                  <CalendarClock className="h-4 w-4 mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {scheduleMode && alsoEmail ? "Schedule" : sendButtonLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
