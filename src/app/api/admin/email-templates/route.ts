import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiRole, isErrorResponse } from "@/lib/api-auth";

// GET /api/admin/email-templates - List all templates
export async function GET() {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const templates = await prisma.emailTemplate.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Email templates GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST /api/admin/email-templates - Create a new template
export async function POST(req: Request) {
  try {
    const auth = await requireApiRole(["TA", "PROFESSOR", "ADMIN"]);
    if (isErrorResponse(auth)) return auth;

    const { name, subject, message, category } = await req.json();

    if (!name?.trim() || !subject?.trim() || !message?.trim()) {
      return NextResponse.json(
        { error: "name, subject, and message are required" },
        { status: 400 }
      );
    }

    const validCategories = ["general", "assignment", "grade", "announcement", "reminder"];
    const cat = category?.trim() || "general";
    if (!validCategories.includes(cat)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${validCategories.join(", ")}` },
        { status: 400 }
      );
    }

    const template = await prisma.emailTemplate.create({
      data: {
        name: name.trim(),
        subject: subject.trim(),
        message: message.trim(),
        category: cat,
        createdById: auth.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Email templates POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
