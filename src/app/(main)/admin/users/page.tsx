"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffectiveSession } from "@/lib/effective-session-context";
import { isStaff as isStaffRole } from "@/lib/constants";
import { api } from "@/lib/api-client";
import {
  Loader2,
  ShieldBan,
  ShieldCheck,
  Trash2,
  Users,
  GraduationCap,
  Shield,
  MessageSquareOff,
  MessageSquare,
  CheckCircle2,
  Circle,
  Eye,
  Send,
  Mail,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { formatDateOnly } from "@/lib/utils";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { UserListItem } from "@/types";

export default function AdminUsersPage() {
  const router = useRouter();
  const effectiveSession = useEffectiveSession();
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserListItem | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const currentUserId = effectiveSession.id;
  const currentUserRole = effectiveSession.role;
  const isAdmin = currentUserRole === "ADMIN" || currentUserRole === "PROFESSOR";
  const isStaff = isAdmin || currentUserRole === "TA";

  // Bulk email state
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<{ users: UserListItem[] }>("/api/admin/users")
      .then((data) => {
        setUsers(data.users || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateRole = async (userId: string, newRole: string) => {
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  role: newRole as UserListItem["role"],
                  // Auto-verify when promoting to TA/ADMIN
                  isVerified: isStaffRole(newRole) ? true : u.isVerified,
                }
              : u
          )
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleBan = async (userId: string, isBanned: boolean) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: isBanned ? "unban" : "ban" }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  isBanned: !isBanned,
                  bannedAt: isBanned ? null : new Date().toISOString(),
                }
              : u
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleRestrict = async (userId: string, isRestricted: boolean) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action: isRestricted ? "unrestrict" : "restrict",
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, isRestricted: !isRestricted } : u
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleVerify = async (userId: string, isVerified: boolean) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          action: isVerified ? "unverify" : "verify",
        }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId ? { ...u, isVerified: !isVerified } : u
          )
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
      setDeleteTarget(null);
    }
  };

  const toggleSelectUser = (userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === users.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(users.map((u) => u.id)));
    }
  };

  // Update indeterminate state on the "select all" checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        selectedUsers.size > 0 && selectedUsers.size < users.length;
    }
  }, [selectedUsers.size, users.length]);

  const sendBulkEmail = async () => {
    if (selectedUsers.size === 0 || !emailSubject.trim() || !emailMessage.trim()) return;
    setEmailSending(true);
    try {
      const res = await fetch("/api/admin/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: Array.from(selectedUsers),
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
        }),
      });
      if (res.ok) {
        setEmailSuccess(true);
        setTimeout(() => {
          setEmailDialogOpen(false);
          setEmailSubject("");
          setEmailMessage("");
          setEmailSuccess(false);
          setSelectedUsers(new Set());
        }, 2000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEmailSending(false);
    }
  };

  const selectedUsersList = users.filter((u) => selectedUsers.has(u.id));

  if (loading) {
    return <LoadingSpinner message="Loading users..." />;
  }

  const studentCount = users.filter((u) => u.role === "STUDENT").length;
  const taCount = users.filter((u) => u.role === "TA").length;
  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const bannedCount = users.filter((u) => u.isBanned).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          User Management
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage user accounts, roles, and access ({users.length} users)
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <GraduationCap className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Students
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{studentCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Users className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              TAs
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{taCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Shield className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Admins
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{adminCount}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950">
              <ShieldBan className="h-4 w-4 text-red-500" />
            </div>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Banned
            </span>
          </div>
          <p className="text-3xl font-bold text-gray-900 dark:text-gray-100">{bannedCount}</p>
        </div>
      </div>

      {/* Selection Toolbar */}
      <div className="flex items-center gap-2 flex-wrap bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl px-4 sm:px-6 py-3 shadow-sm">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mr-1">Select by role:</span>
        {(["STUDENT", "TA", "PROFESSOR", "ADMIN"] as const).map((role) => {
          const roleUsers = users.filter((u) => u.role === role);
          const allSelected = roleUsers.length > 0 && roleUsers.every((u) => selectedUsers.has(u.id));
          return (
            <Button
              key={role}
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedUsers((prev) => {
                  const next = new Set(prev);
                  if (allSelected) {
                    roleUsers.forEach((u) => next.delete(u.id));
                  } else {
                    roleUsers.forEach((u) => next.add(u.id));
                  }
                  return next;
                });
              }}
              className={`text-xs rounded-lg h-7 px-2.5 gap-1 ${
                allSelected
                  ? "bg-indigo-100 border-indigo-300 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950 dark:border-indigo-700 dark:text-indigo-300"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {role === "STUDENT" ? "Students" : role === "TA" ? "TAs" : role === "PROFESSOR" ? "Professors" : "Admins"}
              <span className="text-[10px] opacity-60">({roleUsers.length})</span>
            </Button>
          );
        })}

        {selectedUsers.size > 0 && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              {selectedUsers.size} selected
            </span>
            <Button
              size="sm"
              onClick={() => setEmailDialogOpen(true)}
              className="gap-1.5 text-xs rounded-lg h-7 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <Mail className="h-3.5 w-3.5" />
              Send Email
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedUsers(new Set())}
              className="gap-1.5 text-xs rounded-lg h-7 text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
          </>
        )}
      </div>

      {/* User List */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={users.length > 0 && selectedUsers.size === users.length}
            onChange={toggleSelectAll}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 cursor-pointer"
            aria-label="Select all users"
          />
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">All Users</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800" role="list" aria-label="User list">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isLoading = actionLoading === user.id;

            return (
              <div
                key={user.id}
                role="listitem"
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${
                  user.isBanned ? "bg-red-50/30 dark:bg-red-950/30" : ""
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={selectedUsers.has(user.id)}
                    onChange={() => toggleSelectUser(user.id)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-800 cursor-pointer shrink-0"
                    aria-label={`Select ${user.name || "user"}`}
                  />
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      user.isBanned
                        ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {user.name || "No name"}
                      </p>
                      {isSelf && (
                        <Badge className="bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-[10px]">
                          You
                        </Badge>
                      )}
                      {user.isBanned && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                          Banned
                        </Badge>
                      )}
                      {user.isRestricted && !user.isBanned && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                          Restricted
                        </Badge>
                      )}
                      {user.isVerified && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800 text-[10px]">
                          Verified
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                      {user.email}
                      {user.studentId && (
                        <span className="ml-2 text-gray-400 dark:text-gray-500">· ID: {user.studentId}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-3 flex-wrap pl-12 sm:pl-0">
                  <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                    Joined {formatDateOnly(user.createdAt)}
                  </span>

                  {/* Role selector - Admin only */}
                  {isAdmin && (
                    <Select
                      value={user.role}
                      onValueChange={(value) => updateRole(user.id, value)}
                      disabled={isSelf}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs border-gray-200 dark:border-gray-700 rounded-lg">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STUDENT">Student</SelectItem>
                        <SelectItem value="TA">TA</SelectItem>
                        <SelectItem value="PROFESSOR">Professor</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {/* Role badge for TA view */}
                  {!isAdmin && (
                    <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
                      {user.role}
                    </Badge>
                  )}

                  {/* Verify/Unverify button - both TA and Admin */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSelf || isLoading}
                    onClick={() => toggleVerify(user.id, user.isVerified)}
                    className={`gap-1.5 text-xs rounded-lg ${
                      user.isVerified
                        ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                    }`}
                    title={user.isVerified ? "Remove verified status" : "Mark as verified course student"}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : user.isVerified ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden sm:inline">{user.isVerified ? "Verified" : "Verify"}</span>
                  </Button>

                  {/* Restrict/Unrestrict chat button - Staff (TA+) */}
                  {isStaff && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSelf || isLoading}
                      onClick={() => toggleRestrict(user.id, user.isRestricted)}
                      className={`gap-1.5 text-xs rounded-lg ${
                        user.isRestricted
                          ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                      }`}
                      title={user.isRestricted ? "Allow AI chat access" : "Block AI chat access (can still submit assignments)"}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : user.isRestricted ? (
                        <MessageSquare className="h-3.5 w-3.5" />
                      ) : (
                        <MessageSquareOff className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{user.isRestricted ? "Unrestrict" : "Restrict"}</span>
                    </Button>
                  )}

                  {/* Ban/Unban button - Staff (TA+) */}
                  {isStaff && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSelf || isLoading}
                      onClick={() => toggleBan(user.id, user.isBanned)}
                      className={`gap-1.5 text-xs rounded-lg ${
                        user.isBanned
                          ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          : "border-amber-200 text-amber-700 hover:bg-amber-50"
                      }`}
                      title={user.isBanned ? "Unban user" : "Ban user"}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : user.isBanned ? (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldBan className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">{user.isBanned ? "Unban" : "Ban"}</span>
                    </Button>
                  )}

                  {/* Impersonate button - Admin only */}
                  {isAdmin && !isSelf && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      onClick={async () => {
                        setActionLoading(user.id);
                        try {
                          const res = await fetch("/api/admin/impersonate", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ userId: user.id }),
                          });
                          if (res.ok) {
                            router.push("/");
                            router.refresh();
                          }
                        } catch (err) {
                          console.error(err);
                        } finally {
                          setActionLoading(null);
                        }
                      }}
                      className="gap-1.5 text-xs rounded-lg border-indigo-200 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950"
                      title={`View the app as ${user.name || user.email}`}
                    >
                      {isLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Impersonate</span>
                    </Button>
                  )}

                  {/* Delete button - Admin only */}
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSelf || isLoading}
                      onClick={() => setDeleteTarget(user)}
                      className="gap-1.5 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                      title="Delete user"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Delete</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User Account</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {deleteTarget?.name || deleteTarget?.email}
              </span>
              ? This will soft-delete their account. They will no longer be able
              to log in, but their data will be preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteTarget && deleteUser(deleteTarget.id)}
              className="bg-red-600 hover:bg-red-700 text-white rounded-lg gap-1.5"
              disabled={actionLoading === deleteTarget?.id}
            >
              {actionLoading === deleteTarget?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Delete Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Email Dialog */}
      <Dialog
        open={emailDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEmailDialogOpen(false);
            setEmailSubject("");
            setEmailMessage("");
            setEmailSuccess(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-indigo-500" />
              Send Email to {selectedUsers.size} User{selectedUsers.size !== 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>
              Send a notification email to the selected users. This action will be logged.
            </DialogDescription>
          </DialogHeader>

          {emailSuccess ? (
            <div className="flex flex-col items-center py-6 gap-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Email sent successfully
              </p>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {/* Recipient list */}
              <div className="space-y-2">
                <Label className="text-gray-700 dark:text-gray-300">
                  Recipients ({selectedUsersList.length})
                </Label>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-2 space-y-1">
                  {selectedUsersList.map((u) => (
                    <div key={u.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {u.name || "No name"}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500 truncate">{u.email}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-subject" className="text-gray-700 dark:text-gray-300">
                  Subject
                </Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email subject line"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-message" className="text-gray-700 dark:text-gray-300">
                  Message
                </Label>
                <Textarea
                  id="email-message"
                  value={emailMessage}
                  onChange={(e) => setEmailMessage(e.target.value)}
                  placeholder="Type your message to the selected users..."
                  rows={5}
                  className="rounded-lg resize-none"
                />
              </div>
            </div>
          )}

          {!emailSuccess && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setEmailDialogOpen(false)}
                className="rounded-lg"
              >
                Cancel
              </Button>
              <Button
                onClick={sendBulkEmail}
                disabled={emailSending || !emailSubject.trim() || !emailMessage.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg gap-1.5"
              >
                {emailSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send Email
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
