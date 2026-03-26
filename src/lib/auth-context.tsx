"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  organizationId: string | null;
  role: {
    role: "SYSTEM_OWNER" | "PARTNER_ADMIN";
    organizationId: string | null;
  } | null;
  organization: {
    id: string;
    name: string;
  } | null;
  authState: "APPROVED" | "PENDING" | "NO_ACCESS";
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isSystemOwner: boolean;
  isPartnerAdmin: boolean;
  login: (
    email: string,
    password: string
  ) => Promise<{ success: boolean; error?: string; redirectTo?: string }>;
  register: (
    email: string,
    password: string,
    displayName?: string,
    organizationName?: string
  ) => Promise<{ success: boolean; error?: string; redirectTo?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      const data = await res.json();
      if (data.authenticated && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok && data.user) {
        setUser(data.user);
        return { success: true, redirectTo: data.redirectTo };
      }
      return { success: false, error: data.error || "Login failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const register = async (
    email: string,
    password: string,
    displayName?: string,
    organizationName?: string
  ) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName, organizationName }),
      });
      const data = await res.json();

      if (res.ok && data.user) {
        setUser(data.user);
        return { success: true, redirectTo: data.redirectTo };
      }
      return { success: false, error: data.error || "Registration failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  };

  const refreshSession = async () => {
    await fetchSession();
  };

  const isSystemOwner = user?.role?.role === "SYSTEM_OWNER";
  const isPartnerAdmin = user?.role?.role === "PARTNER_ADMIN";

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user && user.authState === "APPROVED",
        isSystemOwner,
        isPartnerAdmin,
        login,
        register,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}