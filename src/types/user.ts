export type UserRole = "STUDENT" | "TA" | "PROFESSOR" | "ADMIN";

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: UserRole;
}

export interface UserListItem {
  id: string;
  name: string | null;
  email: string;
  studentId: string | null;
  role: UserRole;
  isBanned: boolean;
  bannedAt: string | null;
  isRestricted: boolean;
  isVerified: boolean;
  createdAt: string;
}
