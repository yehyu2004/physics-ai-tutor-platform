"use client";

import React from "react";
import { Loader2, CheckCircle2, Send, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { UserListItem } from "@/types";

interface BulkEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedUsers: UserListItem[];
  subject: string;
  onSubjectChange: (value: string) => void;
  message: string;
  onMessageChange: (value: string) => void;
  sending: boolean;
  success: boolean;
  onSend: () => void;
}

export function BulkEmailDialog({
  open,
  onOpenChange,
  selectedUsers,
  subject,
  onSubjectChange,
  message,
  onMessageChange,
  sending,
  success,
  onSend,
}: BulkEmailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-500" />
            Send Email to {selectedUsers.length} User{selectedUsers.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Send a notification email to the selected users. This action will be logged.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Email sent successfully
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-gray-700 dark:text-gray-300">
                Recipients ({selectedUsers.length})
              </Label>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-2 space-y-1">
                {selectedUsers.map((u) => (
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
                value={subject}
                onChange={(e) => onSubjectChange(e.target.value)}
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
                value={message}
                onChange={(e) => onMessageChange(e.target.value)}
                placeholder="Type your message to the selected users..."
                rows={5}
                className="rounded-lg resize-none"
              />
            </div>
          </div>
        )}

        {!success && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={onSend}
              disabled={sending || !subject.trim() || !message.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg gap-1.5"
            >
              {sending ? (
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
  );
}
