"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotifyUsersDialog } from "@/components/ui/notify-users-dialog";
import { AssignmentForm, type AssignmentFormData } from "@/components/assignments/AssignmentForm";
import { toast } from "sonner";

export default function CreateAssignmentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [exportingLatex, setExportingLatex] = useState(false);
  const [scheduledPublishAt, setScheduledPublishAt] = useState("");
  const [showScheduleOptions, setShowScheduleOptions] = useState(false);
  const [createdAssignmentId, setCreatedAssignmentId] = useState<string | null>(null);
  const [isScheduleMode, setIsScheduleMode] = useState(false);

  // Reminder dialog state
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderSubject, setReminderSubject] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");

  const handleSubmit = async (
    formData: AssignmentFormData,
    getQuestionsWithUrls: () => Promise<Array<{
      questionText: string;
      questionType: string;
      options: string[];
      correctAnswer: string;
      points: number;
      diagram?: unknown;
      imageUrl?: string;
    }>>,
    publish: boolean,
    schedule?: boolean,
  ) => {
    if (!formData.title.trim()) {
      toast.error("Please enter a title for the assignment");
      return;
    }

    // Validate schedule date
    if (schedule && scheduledPublishAt) {
      const scheduledDate = new Date(scheduledPublishAt);
      if (scheduledDate <= new Date()) {
        toast.error("Scheduled time must be in the future");
        return;
      }
    }

    setLoading(true);

    try {
      const questionsWithUrls = await getQuestionsWithUrls();

      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          dueDate: formData.dueDate || null,
          type: formData.type,
          totalPoints: formData.totalPoints,
          pdfUrl: formData.pdfUrl || null,
          lockAfterSubmit: formData.lockAfterSubmit,
          questions: formData.type === "QUIZ" ? questionsWithUrls : [],
          ...(schedule && scheduledPublishAt && {
            scheduledPublishAt,
          }),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        toast.error(errData?.error || "Failed to create assignment");
        return;
      }

      const data = await res.json();

      if (publish && !schedule) {
        await fetch(`/api/assignments/${data.assignment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ published: true }),
        });
      }

      // For scheduled assignments, show notify dialog
      if (schedule) {
        toast.success(`Assignment scheduled for ${new Date(scheduledPublishAt).toLocaleString()}`);
        setIsScheduleMode(true);
        setCreatedAssignmentId(data.assignment.id);
        const dueDateStr = formData.dueDate
          ? new Date(formData.dueDate).toLocaleString("en-US", {
              weekday: "long", year: "numeric", month: "long", day: "numeric",
              hour: "numeric", minute: "2-digit",
            })
          : "No due date set";
        setReminderSubject(`New Assignment: ${formData.title}`);
        setReminderMessage(
          `A new assignment has been posted on PhysTutor.\n\nTitle: ${formData.title}${formData.description ? `\nDescription: ${formData.description}` : ""}\nDue: ${dueDateStr}\nPoints: ${formData.totalPoints}\n\nPlease log in to PhysTutor to view the full assignment details.`
        );
        setReminderOpen(true);
        return;
      }

      // Show reminder dialog instead of immediate redirect
      const dueDateStr = formData.dueDate
        ? new Date(formData.dueDate).toLocaleString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })
        : "No due date set";
      setReminderSubject(`New Assignment: ${formData.title}`);
      setReminderMessage(
        `A new assignment has been posted on PhysTutor.\n\nTitle: ${formData.title}${formData.description ? `\nDescription: ${formData.description}` : ""}\nDue: ${dueDateStr}\nPoints: ${formData.totalPoints}\n\nPlease log in to PhysTutor to view the full assignment details.`
      );

      setIsScheduleMode(false);
      setReminderOpen(true);
    } catch (err) {
      console.error("Create assignment error:", err);
      toast.error(err instanceof Error ? err.message : "Failed to create assignment");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndExportLatex = async (
    formData: AssignmentFormData,
    getQuestionsWithUrls: () => Promise<Array<{
      questionText: string;
      questionType: string;
      options: string[];
      correctAnswer: string;
      points: number;
      diagram?: unknown;
      imageUrl?: string;
    }>>,
  ) => {
    if (!formData.title.trim()) {
      toast.error("Please enter a title for the assignment");
      return;
    }
    setExportingLatex(true);

    try {
      const questionsWithUrls = await getQuestionsWithUrls();

      // Create assignment as draft
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          dueDate: formData.dueDate || null,
          type: formData.type,
          totalPoints: formData.totalPoints,
          pdfUrl: formData.pdfUrl || null,
          lockAfterSubmit: formData.lockAfterSubmit,
          questions: formData.type === "QUIZ" ? questionsWithUrls : [],
        }),
      });

      if (!res.ok) throw new Error("Failed to create assignment");

      const data = await res.json();
      const newId = data.assignment.id;

      // Fetch LaTeX export
      const exportRes = await fetch(`/api/assignments/${newId}/export-latex`);
      if (!exportRes.ok) throw new Error("Export failed");

      const blob = await exportRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${formData.title.replace(/[^a-zA-Z0-9_\- ]/g, "").replace(/\s+/g, "_").slice(0, 60)}_latex.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Redirect to the new assignment
      router.push(`/assignments/${newId}`);
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save and export LaTeX");
    } finally {
      setExportingLatex(false);
    }
  };

  return (
    <>
      <AssignmentForm
        mode="create"
        title="Create Assignment"
        subtitle="Set up a new assignment or quiz for students"
        backHref="/assignments"
        submitting={loading || exportingLatex}
        extraContent={
          showScheduleOptions ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  Schedule Publish
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Publish Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledPublishAt}
                    onChange={(e) => setScheduledPublishAt(e.target.value)}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    lang="en-US"
                  />
                  {scheduledPublishAt && (
                    <p className="text-xs text-blue-600 dark:text-blue-400">
                      Will auto-publish on {new Date(scheduledPublishAt).toLocaleString("en-US", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                    </p>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  After scheduling, you can customize the notification email with templates and select recipients.
                </p>
              </CardContent>
            </Card>
          ) : null
        }
        renderActions={({ formData, getQuestionsWithUrls, titleValid }) => (
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-3 pb-8">
            <Button
              variant="outline"
              onClick={() => handleSubmit(formData, getQuestionsWithUrls, false)}
              disabled={loading || exportingLatex || !titleValid}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save as Draft
            </Button>
            {formData.type === "QUIZ" && (
              <Button
                variant="outline"
                onClick={() => handleSaveAndExportLatex(formData, getQuestionsWithUrls)}
                disabled={loading || exportingLatex || !titleValid}
              >
                {exportingLatex ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Download className="h-4 w-4 mr-2" />
                )}
                Save & Download LaTeX
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => {
                if (showScheduleOptions && scheduledPublishAt) {
                  handleSubmit(formData, getQuestionsWithUrls, false, true);
                } else {
                  setShowScheduleOptions(!showScheduleOptions);
                }
              }}
              disabled={loading || exportingLatex || !titleValid || (showScheduleOptions && !scheduledPublishAt)}
              className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-800 dark:hover:bg-blue-950"
            >
              <CalendarClock className="h-4 w-4" />
              {showScheduleOptions ? "Confirm Schedule" : "Schedule Publish"}
            </Button>
            <Button
              onClick={() => handleSubmit(formData, getQuestionsWithUrls, true)}
              disabled={loading || exportingLatex || !titleValid}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Publish Now
            </Button>
          </div>
        )}
      />

      {/* Assignment Reminder Dialog */}
      <NotifyUsersDialog
        open={reminderOpen}
        onOpenChange={setReminderOpen}
        defaultSubject={reminderSubject}
        defaultMessage={reminderMessage}
        enableScheduling={isScheduleMode}
        defaultScheduledAt={isScheduleMode ? scheduledPublishAt : undefined}
        onSkip={() => {
          const target = createdAssignmentId ? `/assignments/${createdAssignmentId}` : "/assignments";
          router.push(target);
          router.refresh();
        }}
        onSent={() => {
          const target = createdAssignmentId ? `/assignments/${createdAssignmentId}` : "/assignments";
          router.push(target);
          router.refresh();
        }}
      />
    </>
  );
}
