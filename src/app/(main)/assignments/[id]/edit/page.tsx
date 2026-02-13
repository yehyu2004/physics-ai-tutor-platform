"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AssignmentForm, type AssignmentFormData, type QuestionFormData } from "@/components/assignments/AssignmentForm";
import { toast } from "sonner";

export default function EditAssignmentPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [initialData, setInitialData] = useState<Partial<AssignmentFormData> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingLatex, setExportingLatex] = useState(false);

  useEffect(() => {
    fetch(`/api/assignments/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        const a = data.assignment;
        if (!a) return;
        setInitialData({
          title: a.title,
          description: a.description || "",
          dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 16) : "",
          type: a.type,
          totalPoints: a.totalPoints,
          lockAfterSubmit: a.lockAfterSubmit || false,
          pdfUrl: a.pdfUrl || null,
          questions: (a.questions || []).map(
            (q: {
              questionText: string;
              questionType: "MC" | "NUMERIC" | "FREE_RESPONSE";
              options: string[] | null;
              correctAnswer: string | null;
              points: number;
              diagram?: { type: "svg" | "mermaid"; content: string } | null;
              imageUrl?: string | null;
            }) => ({
              questionText: q.questionText,
              questionType: q.questionType,
              options: q.options || ["", "", "", ""],
              correctAnswer: q.correctAnswer || "",
              points: q.points,
              diagram: q.diagram || null,
              imageUrl: q.imageUrl || null,
            })
          ) as QuestionFormData[],
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  const handleSave = async (
    formData: AssignmentFormData,
    getQuestionsWithUrls: () => Promise<
      Array<{
        questionText: string;
        questionType: string;
        options: string[];
        correctAnswer: string;
        points: number;
        diagram?: unknown;
        imageUrl?: string;
      }>
    >,
    publish: boolean
  ) => {
    if (!formData.title.trim()) return;
    setSaving(true);

    try {
      const questionsWithUrls = await getQuestionsWithUrls();

      await fetch(`/api/assignments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          dueDate: formData.dueDate || null,
          totalPoints: formData.totalPoints,
          pdfUrl: formData.pdfUrl || null,
          lockAfterSubmit: formData.lockAfterSubmit,
          published: publish ? true : undefined,
          questions: formData.type === "QUIZ" ? questionsWithUrls : [],
        }),
      });

      router.push(`/assignments/${params.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <AssignmentForm
      mode="edit"
      initialData={initialData ?? undefined}
      title="Edit Assignment"
      subtitle="Modify assignment details, questions, and scoring"
      backHref={`/assignments/${params.id}`}
      submitting={saving || exportingLatex}
      showDiagrams
      renderActions={({ formData, getQuestionsWithUrls, titleValid }) => (
        <div className="flex flex-wrap justify-end gap-3 pb-8">
          <Button
            variant="outline"
            onClick={() => handleSave(formData, getQuestionsWithUrls, false)}
            disabled={saving || exportingLatex || !titleValid}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save
          </Button>
          {formData.type === "QUIZ" && (
            <Button
              variant="outline"
              onClick={async () => {
                setExportingLatex(true);
                try {
                  const res = await fetch(
                    `/api/assignments/${params.id}/export-latex`
                  );
                  if (!res.ok) throw new Error("Export failed");
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${formData.title
                    .replace(/[^a-zA-Z0-9_\- ]/g, "")
                    .replace(/\s+/g, "_")
                    .slice(0, 60)}_latex.zip`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (err) {
                  console.error(err);
                  toast.error("Failed to export LaTeX");
                } finally {
                  setExportingLatex(false);
                }
              }}
              disabled={saving || exportingLatex}
            >
              {exportingLatex ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download LaTeX
            </Button>
          )}
          <Button
            onClick={() => handleSave(formData, getQuestionsWithUrls, true)}
            disabled={saving || exportingLatex || !titleValid}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save &amp; Publish
          </Button>
        </div>
      )}
    />
  );
}
