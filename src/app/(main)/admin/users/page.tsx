"use client";

import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
import { formatShortDate } from "@/lib/utils";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: "STUDENT" | "TA" | "ADMIN";
  isBanned: boolean;
  bannedAt: string | null;
  isRestricted: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const currentUserId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    fetch("/api/admin/users")
      .then((res) => res.json())
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
            u.id === userId ? { ...u, role: newRole as User["role"] } : u
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" />
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading users...</p>
      </div>
    );
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

      {/* User List */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">All Users</h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isLoading = actionLoading === user.id;

            return (
              <div
                key={user.id}
                className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${
                  user.isBanned ? "bg-red-50/30 dark:bg-red-950/30" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      user.isBanned
                        ? "bg-red-100 text-red-600 dark:bg-red-900 dark:text-red-400"
                        : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
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
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:block">
                    Joined {formatShortDate(user.createdAt)}
                  </span>

                  {/* Role selector */}
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
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Restrict/Unrestrict chat button */}
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
                    {user.isRestricted ? "Unrestrict" : "Restrict"}
                  </Button>

                  {/* Ban/Unban button */}
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
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : user.isBanned ? (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldBan className="h-3.5 w-3.5" />
                    )}
                    {user.isBanned ? "Unban" : "Ban"}
                  </Button>

                  {/* Delete button */}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSelf || isLoading}
                    onClick={() => setDeleteTarget(user)}
                    className="gap-1.5 text-xs rounded-lg border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
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
    </div>
  );
}
