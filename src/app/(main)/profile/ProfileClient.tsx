"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Save, User, Mail, IdCard, Shield, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  studentId: string | null;
  role: string;
  image: string | null;
  createdAt: string;
}

export default function ProfileClient() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/user/profile")
      .then((res) => res.json())
      .then((data) => {
        setProfile(data);
        setName(data.name || "");
        setStudentId(data.studentId || "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, studentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "Failed to update profile" });
      } else {
        setProfile(data);
        setMessage({ type: "success", text: "Profile updated successfully" });
      }
    } catch {
      setMessage({ type: "error", text: "Something went wrong" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20 text-gray-500">Failed to load profile</div>
    );
  }

  const memberSince = new Date(profile.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      <div className="pt-2 animate-fade-in">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Profile</h1>
        <p className="text-gray-400 mt-1">View and manage your account information</p>
      </div>

      {/* Profile Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm p-8 animate-fade-in">
        {/* Avatar & Basic Info */}
        <div className="flex items-center gap-5 mb-8 pb-6 border-b border-gray-100 dark:border-gray-800">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile.image || undefined} alt={profile.name || "User"} />
            <AvatarFallback className="text-lg font-medium bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {profile.name?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {profile.name || "Unnamed User"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{profile.email}</p>
            <Badge
              variant="secondary"
              className="mt-1.5 text-xs uppercase tracking-wide"
            >
              {profile.role}
            </Badge>
          </div>
        </div>

        {/* Read-only fields */}
        <div className="space-y-5 mb-8">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Email</p>
              <p className="text-gray-900 dark:text-gray-100">{profile.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Shield className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Role</p>
              <p className="text-gray-900 dark:text-gray-100 uppercase tracking-wide">{profile.role}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Calendar className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-gray-500 dark:text-gray-400 text-xs">Member Since</p>
              <p className="text-gray-900 dark:text-gray-100">{memberSince}</p>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="border-t border-gray-100 dark:border-gray-800 pt-6 space-y-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Edit Information</h3>

          <div className="space-y-1.5">
            <Label htmlFor="profile-name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              <User className="inline h-3.5 w-3.5 mr-1.5" />
              Full Name
            </Label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-11 rounded-lg"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-studentId" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              <IdCard className="inline h-3.5 w-3.5 mr-1.5" />
              Student ID
            </Label>
            <Input
              id="profile-studentId"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 112012345"
              className="h-11 rounded-lg"
            />
          </div>

          {message && (
            <div
              className={`rounded-lg p-3 text-sm ${
                message.type === "success"
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                  : "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {message.text}
            </div>
          )}

          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-10 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-gray-200 dark:text-gray-900 text-white"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}
