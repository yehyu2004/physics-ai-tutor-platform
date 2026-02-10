"use client";

import React, { createContext, useContext } from "react";
import type { UserRole } from "@/types";

interface EffectiveSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  image?: string;
  isImpersonating: boolean;
}

const EffectiveSessionContext = createContext<EffectiveSession | null>(null);

export function EffectiveSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: EffectiveSession;
}) {
  return (
    <EffectiveSessionContext.Provider value={session}>
      {children}
    </EffectiveSessionContext.Provider>
  );
}

export function useEffectiveSession(): EffectiveSession {
  const ctx = useContext(EffectiveSessionContext);
  if (!ctx) {
    throw new Error("useEffectiveSession must be used within EffectiveSessionProvider");
  }
  return ctx;
}
