import { NextRequest } from "next/server";
import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";

function escapeCSV(value: string | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getEffectiveSession();
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const userRole = (session.user as { role?: string }).role;
    if (userRole !== "TA" && userRole !== "PROFESSOR" && userRole !== "ADMIN") {
      return new Response("Forbidden", { status: 403 });
    }

    const assignmentId = req.nextUrl.searchParams.get("assignmentId");

    const where = assignmentId ? { assignmentId } : {};

    const submissions = await prisma.submission.findMany({
      where,
      include: {
        user: { select: { name: true, email: true, studentId: true } },
        assignment: { select: { title: true, totalPoints: true } },
      },
      orderBy: [{ assignment: { title: "asc" } }, { user: { name: "asc" } }],
    });

    const rows: string[] = [];

    if (assignmentId) {
      rows.push("Student Name,Email,Student ID,Score,Total Points,Submitted At,Graded At");
      for (const s of submissions) {
        rows.push(
          [
            escapeCSV(s.user.name),
            escapeCSV(s.user.email),
            escapeCSV(s.user.studentId),
            s.totalScore != null ? String(s.totalScore) : "",
            String(s.assignment.totalPoints),
            s.submittedAt.toISOString(),
            s.gradedAt?.toISOString() ?? "",
          ].join(",")
        );
      }
    } else {
      rows.push("Student Name,Email,Student ID,Assignment,Score,Total Points,Submitted At,Graded At");
      for (const s of submissions) {
        rows.push(
          [
            escapeCSV(s.user.name),
            escapeCSV(s.user.email),
            escapeCSV(s.user.studentId),
            escapeCSV(s.assignment.title),
            s.totalScore != null ? String(s.totalScore) : "",
            String(s.assignment.totalPoints),
            s.submittedAt.toISOString(),
            s.gradedAt?.toISOString() ?? "",
          ].join(",")
        );
      }
    }

    const csv = rows.join("\n");

    let filename = "grades-all.csv";
    if (assignmentId && submissions.length > 0) {
      const title = submissions[0].assignment.title
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .substring(0, 50);
      filename = `grades-${title}.csv`;
    }

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Grade export error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
