"use client";

import { useState, useCallback } from "react";

interface UseUploadFileOptions {
  /** API endpoint to POST the file to. Default: "/api/upload" */
  endpoint?: string;
  /** Max file size in bytes. If exceeded, calls onSizeError. Default: no limit */
  maxSizeBytes?: number;
  /** Called when file exceeds maxSizeBytes */
  onSizeError?: (file: File, maxBytes: number) => void;
}

interface UseUploadFileReturn {
  /** Upload a file and return the URL, or null on failure */
  upload: (file: File) => Promise<string | null>;
  /** Whether an upload is currently in progress */
  uploading: boolean;
}

export function useUploadFile(options: UseUploadFileOptions = {}): UseUploadFileReturn {
  const {
    endpoint = "/api/upload",
    maxSizeBytes,
    onSizeError,
  } = options;

  const [uploading, setUploading] = useState(false);

  const upload = useCallback(async (file: File): Promise<string | null> => {
    if (maxSizeBytes && file.size > maxSizeBytes) {
      onSizeError?.(file, maxSizeBytes);
      return null;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        return data.url;
      }
      return null;
    } catch {
      return null;
    } finally {
      setUploading(false);
    }
  }, [endpoint, maxSizeBytes, onSizeError]);

  return { upload, uploading };
}
