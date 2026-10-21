"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import type { Role } from "@/domain/auth/roles";

import { USERS, type PreviewUser } from "./fixtures";

/**
 * Preview persona switcher. VISUAL DEMONSTRATION ONLY: it changes which UI is
 * shown and is never an authorisation mechanism. State lives in React memory
 * only; a reload resets it.
 */
type PersonaContextValue = { user: PreviewUser; role: Role; setUserId: (id: string) => void };

const PersonaContext = createContext<PersonaContextValue | null>(null);

export const DEFAULT_PERSONA_ID = "u-ahmed";

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState(DEFAULT_PERSONA_ID);
  const value = useMemo(() => {
    const user = USERS.find((u) => u.id === userId) ?? USERS[0]!;
    return { user, role: user.role, setUserId };
  }, [userId]);
  return <PersonaContext.Provider value={value}>{children}</PersonaContext.Provider>;
}

export function usePersona(): PersonaContextValue {
  const value = useContext(PersonaContext);
  if (!value) throw new Error("usePersona must be used inside PersonaProvider");
  return value;
}
