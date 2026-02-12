import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const session = await getEffectiveSession();
        if (!session?.user) {
          throw new Error("Unauthorized");
        }

        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5 MB
        };
      },
      onUploadCompleted: async () => {
        // No action needed — the client gets the URL directly from upload()
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
