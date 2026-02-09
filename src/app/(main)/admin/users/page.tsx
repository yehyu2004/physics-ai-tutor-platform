"use client";

import React, { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatShortDate } from "@/lib/utils";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: "STUDENT" | "TA" | "ADMIN";
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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


  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Manage user accounts and roles ({users.length} users)
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="gradient-card-purple border-0">
          <CardContent className="p-6">
            <div className="text-3xl font-bold">
              {users.filter((u) => u.role === "STUDENT").length}
            </div>
            <p className="text-sm font-medium mt-1">Students</p>
          </CardContent>
        </Card>
        <Card className="gradient-card-pink border-0">
          <CardContent className="p-6">
            <div className="text-3xl font-bold">
              {users.filter((u) => u.role === "TA").length}
            </div>
            <p className="text-sm font-medium mt-1">TAs</p>
          </CardContent>
        </Card>
        <Card className="gradient-card-blue border-0">
          <CardContent className="p-6">
            <div className="text-3xl font-bold">
              {users.filter((u) => u.role === "ADMIN").length}
            </div>
            <p className="text-sm font-medium mt-1">Admins</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-neutral-100 flex items-center justify-center text-sm font-medium">
                    {user.name?.[0]?.toUpperCase() || "U"}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{user.name || "No name"}</p>
                    <p className="text-xs text-neutral-400">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-xs text-neutral-400">
                    Joined {formatShortDate(user.createdAt)}
                  </span>
                  <Select
                    value={user.role}
                    onValueChange={(value) => updateRole(user.id, value)}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STUDENT">Student</SelectItem>
                      <SelectItem value="TA">TA</SelectItem>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
