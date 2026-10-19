import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, getErrorMessage } from "../api";

type Session = {
  token: string;
  user: { id: string; email: string; role: "admin" | "agent" };
};

type AuthContextValue = {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  authenticatedRequest: (
    path: string,
    options?: RequestInit,
  ) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isSession(value: unknown): value is Session {
  if (
    typeof value !== "object" ||
    value === null ||
    !("token" in value) ||
    typeof value.token !== "string" ||
    !("user" in value)
  )
    return false;
  const user = value.user;
  return (
    typeof user === "object" &&
    user !== null &&
    "id" in user &&
    typeof user.id === "string" &&
    "email" in user &&
    typeof user.email === "string" &&
    "role" in user &&
    (user.role === "admin" || user.role === "agent")
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const queryClient = useQueryClient();

  function logout() {
    setSession(null);
    queryClient.clear();
  }

  async function login(email: string, password: string) {
    const response = await apiRequest("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(await getErrorMessage(response));
    const data: unknown = await response.json();
    if (!isSession(data)) throw new Error("Unexpected login response.");
    queryClient.clear();
    setSession(data);
  }

  async function authenticatedRequest(path: string, options: RequestInit = {}) {
    if (!session) throw new Error("Please sign in.");
    const response = await apiRequest(path, options, session.token);
    if (response.status === 401) {
      logout();
      throw new Error("Your session has expired. Please sign in again.");
    }
    return response;
  }

  return (
    <AuthContext.Provider
      value={{ session, login, logout, authenticatedRequest }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth requires AuthProvider.");
  return auth;
}
