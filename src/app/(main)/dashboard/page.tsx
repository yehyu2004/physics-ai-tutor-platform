import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { formatDate } from "@/lib/utils";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const user = session.user as { id: string; name?: string | null; role?: string };
  const userId = user.id;
  const role = (user.role as string) || "STUDENT";

  const [conversationCount, assignmentCount, submissionCount] = await Promise.all([
    prisma.conversation.count({ where: { userId } }),
    prisma.assignment.count({ where: { published: true } }),
    prisma.submission.count({ where: { userId } }),
  ]);

  const recentConversations = await prisma.conversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 5,
    include: {
      messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const upcomingAssignments = await prisma.assignment.findMany({
    where: {
      published: true,
      dueDate: { gte: new Date() },
    },
    orderBy: { dueDate: "asc" },
    take: 5,
  });

  let adminStats = null;
  if (role === "ADMIN") {
    const [totalUsers, totalConversations, totalSubmissions] = await Promise.all([
      prisma.user.count(),
      prisma.conversation.count(),
      prisma.submission.count(),
    ]);
    adminStats = { totalUsers, totalConversations, totalSubmissions };
  }

  let taStats = null;
  if (role === "TA" || role === "ADMIN") {
    const pendingGrading = await prisma.submission.count({
      where: { totalScore: null },
    });
    const createdAssignments = await prisma.assignment.count({
      where: { createdById: userId },
    });
    taStats = { pendingGrading, createdAssignments };
  }

  return (
    <DashboardClient
      userName={user.name || "User"}
      userRole={role}
      date={formatDate(new Date())}
      stats={{
        conversationCount,
        assignmentCount,
        submissionCount,
      }}
      adminStats={adminStats}
      taStats={taStats}
      recentConversations={recentConversations.map((c: { id: string; title: string; updatedAt: Date; messages: { content: string }[] }) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
        lastMessage: c.messages[0]?.content?.slice(0, 80) || "No messages yet",
      }))}
      upcomingAssignments={upcomingAssignments.map((a) => ({
        id: a.id,
        title: a.title,
        dueDate: a.dueDate?.toISOString() || null,
        type: a.type,
      }))}
    />
  );
}
