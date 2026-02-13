"use client";

import React from "react";
import { Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface FileUploadSectionProps {
  /** "main" for FILE_UPLOAD type assignments, "attachment" for QUIZ optional attachment */
  variant: "main" | "attachment";
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export function FileUploadSection({
  variant,
  file,
  onFileChange,
}: FileUploadSectionProps) {
  const isMain = variant === "main";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {isMain ? "Upload Your Submission" : "Attach Your Work (Optional)"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-xl ${isMain ? "p-8" : "p-6"} text-center`}
        >
          <Upload
            className={`${isMain ? "h-10 w-10" : "h-8 w-8"} text-neutral-300 mx-auto ${isMain ? "mb-3" : "mb-2"}`}
          />
          <p className="text-sm text-neutral-500 mb-3">
            {isMain
              ? "Upload your submission (PDF, images, etc.)"
              : "Upload a PDF with your handwritten or additional work"}
          </p>
          <input
            type="file"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              if (f && f.size > 20 * 1024 * 1024) {
                toast.error("File exceeds the 20 MB limit. Please use a smaller file.");
                e.target.value = "";
                return;
              }
              onFileChange(f);
            }}
            className="text-sm"
            accept={isMain ? ".pdf,.png,.jpg,.jpeg,.doc,.docx" : ".pdf"}
          />
          {file && (
            <p className="text-sm text-emerald-600 mt-2">
              Selected: {file.name}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
