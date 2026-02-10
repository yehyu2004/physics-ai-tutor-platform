import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ChatPageClient from "./ChatPageClient";

export default async function ChatPage() {
  const session = await getEffectiveSession();
  if (!session?.user) redirect("/login");

  const user = session.user as { id: string; name?: string | null; role?: string };

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id, isDeleted: false },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      updatedAt: true,
    },
  });

  return (
    <ChatPageClient
      conversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      userId={user.id}
    />
  );
}
