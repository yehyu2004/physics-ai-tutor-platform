export type UserRole = "STUDENT" | "TA" | "PROFESSOR" | "ADMIN";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  image?: string;
}
