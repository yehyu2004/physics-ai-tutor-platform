"use client";

import React from "react";
import {
  Loader2,
  ShieldBan,
  ShieldCheck,
  Trash2,
  MessageSquareOff,
  MessageSquare,
  CheckCircle2,
  Circle,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDateOnly } from "@/lib/utils";
import type { UserListItem } from "@/types";

interface UserRowProps {
  user: UserListItem;
  isSelf: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  isLoading: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onUpdateRole: (userId: string, role: string) => void;
  onToggleBan: (userId: string, isBanned: boolean) => void;
  onToggleRestrict: (userId: string, isRestricted: boolean) => void;
  onToggleVerify: (userId: string, isVerified: boolean) => void;
  onImpersonate: (userId: string) => void;
  onDelete: (user: UserListItem) => void;
}

export function UserRow({
  user,
  isSelf,
  isAdmin,
  isStaff,
  isLoading,
  isSelected,
  onToggleSelect,
  onUpdateRole,
  onToggleBan,
  onToggleRestrict,
  onToggleVerify,
  onImpersonate,
  onDelete,
}: UserRowProps) {
  return (
    <div
      role="listitem"
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between px-4 sm:px-6 py-4 gap-3 hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors ${
        user.isBanned ? "bg-red-50/30 dark:bg-red-950/30" : ""
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
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

        {isAdmin && (
          <Select
            value={user.role}
            onValueChange={(value) => onUpdateRole(user.id, value)}
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

        {!isAdmin && (
          <Badge className="text-[10px] bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700">
            {user.role}
          </Badge>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={isSelf || isLoading}
          onClick={() => onToggleVerify(user.id, user.isVerified)}
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

        {isStaff && (
          <Button
            variant="outline"
            size="sm"
            disabled={isSelf || isLoading}
            onClick={() => onToggleRestrict(user.id, user.isRestricted)}
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

        {isStaff && (
          <Button
            variant="outline"
            size="sm"
            disabled={isSelf || isLoading}
            onClick={() => onToggleBan(user.id, user.isBanned)}
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

        {isAdmin && !isSelf && (
          <Button
            variant="outline"
            size="sm"
            disabled={isLoading}
            onClick={() => onImpersonate(user.id)}
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

        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            disabled={isSelf || isLoading}
            onClick={() => onDelete(user)}
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
}
