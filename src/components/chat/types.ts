export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrls?: string[];
  thinking?: string;
}

export interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}
