import { getEffectiveSession } from "@/lib/impersonate";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ChatPageClient from "../ChatPageClient";

export default async function ChatConversationPage({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  params,
}: {
  params: { id: string };
}) {
  const session = await getEffectiveSession();
  if (!session?.user) redirect("/login");

  const user = session.user as { id: string };

  const conversations = await prisma.conversation.findMany({
    where: { userId: user.id, isDeleted: false },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });

  return (
    <ChatPageClient
      conversations={conversations.map((c) => ({
        id: c.id,
        title: c.title,
        updatedAt: c.updatedAt.toISOString(),
      }))}
      userId={user.id}
      conversationLimit={50}
    />
  );
}
