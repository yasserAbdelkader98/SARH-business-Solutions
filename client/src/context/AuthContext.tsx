import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest, getErrorMessage } from "../api";

type Session = {
  user: { id: string; email: string; role: "admin" | "agent" };
};

type AuthContextValue = {
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  loading: boolean;
  authError: string;
  logout: () => Promise<void>;
  authenticatedRequest: (
    path: string,
    options?: RequestInit,
  ) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null || !("user" in value))
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

  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function restoreSession() {
      try {
        const response = await apiRequest("/me", { signal: controller.signal });
        if (response.status === 401) return;
        if (!response.ok) throw new Error(await getErrorMessage(response));
        const data: unknown = await response.json();
        if (!isSession(data)) throw new Error("Unexpected session response.");
        if (!controller.signal.aborted) setSession(data);
      } catch (error) {
        if (!controller.signal.aborted)
          setAuthError(
            error instanceof Error ? error.message : "Cannot restore session.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void restoreSession();
    return () => controller.abort();
  }, []);

  async function logout() {
    const response = await apiRequest("/logout", { method: "POST" });
    if (!response.ok) throw new Error(await getErrorMessage(response));
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
    setAuthError("");
    setSession(data);
  }

  async function authenticatedRequest(path: string, options: RequestInit = {}) {
    if (!session) throw new Error("Please sign in.");
    const response = await apiRequest(path, options);
    if (response.status === 401) {
      setSession(null);
      queryClient.clear();
      throw new Error("Your session has expired. Please sign in again.");
    }
    return response;
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        authError,
        login,
        logout,
        authenticatedRequest,
      }}
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
