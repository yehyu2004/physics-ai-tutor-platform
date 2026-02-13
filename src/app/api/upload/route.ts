import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireApiAuth, isErrorResponse } from "@/lib/api-auth";

export async function POST(req: Request) {
  try {
    const auth = await requireApiAuth();
    if (isErrorResponse(auth)) return auth;

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // NOTE: File size is checked after the request body has been fully read into memory.
    // For production hardening, consider using presigned upload URLs (e.g., Vercel Blob
    // client uploads or S3 presigned URLs) so the server never buffers the full file.
    // This is a known limitation; the current check still prevents storage of oversized files.
    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds the 20 MB size limit" }, { status: 413 });
    }

    // Validate file type
    const ALLOWED_MIME_TYPES = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/gif",
      "image/webp",
    ];
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Allowed: PDF, PNG, JPEG, GIF, WebP" },
        { status: 400 }
      );
    }

    // Validate file extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "gif", "webp"];
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: "Invalid file extension" },
        { status: 400 }
      );
    }

    const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    // Use Vercel Blob in production, fall back to local storage in dev
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(uniqueName, file, { access: "public" });
      return NextResponse.json({ url: blob.url });
    }

    // Local fallback: save to public/uploads/
    const fs = await import("fs/promises");
    const path = await import("path");
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    const filePath = path.join(uploadsDir, uniqueName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return NextResponse.json({ url: `/uploads/${uniqueName}` });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
