// Route guard: redirects to /login when there is no authenticated session.

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth.js";
import type { ReactNode } from "react";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const location = useLocation();
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
