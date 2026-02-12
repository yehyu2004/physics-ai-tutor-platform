import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { put } from "@vercel/blob";

export async function POST(req: Request) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds the 20 MB size limit" }, { status: 413 });
    }

    const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

    const blob = await put(uniqueName, file, { access: "public" });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
