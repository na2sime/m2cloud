// Auth context: holds the current user/token, exposes login/register/logout,
// and persists the session to localStorage.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api.js";
import {
  clearSession,
  loadSession,
  saveSession,
  type Session,
} from "./storage.js";
import type { User } from "./types.js";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  login(username: string, password: string): Promise<void>;
  register(
    email: string,
    username: string,
    password: string,
  ): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession());

  const apply = useCallback((next: Session) => {
    saveSession(next);
    setSession(next);
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await api.login({ username, password });
      apply({ token: res.token, user: res.user });
    },
    [apply],
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const res = await api.register({ email, username, password });
      apply({ token: res.token, user: res.user });
    },
    [apply],
  );

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      login,
      register,
      logout,
    }),
    [session, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
