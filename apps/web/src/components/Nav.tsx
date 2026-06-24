// Top navigation bar: brand, logged-in username, notifications indicator, logout.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api.js";
import { useAuth } from "../auth.js";

export function Nav() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    if (!token) {
      setUnread(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const notifications = await api.listNotifications();
        if (!cancelled) {
          setUnread(notifications.filter((n) => !n.read).length);
        }
      } catch (err) {
        // A failed notifications fetch should not break the nav.
        if (!cancelled && err instanceof ApiError) setUnread(null);
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [token]);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="nav">
      <div className="nav-left">
        <Link to="/rooms" className="brand">
          Hearth
        </Link>
      </div>
      <div className="nav-right">
        {user ? (
          <>
            <span
              className="notif"
              title={
                unread === null ? "Notifications" : `${unread} unread`
              }
            >
              <span aria-hidden="true">🔔</span>
              {unread !== null && unread > 0 ? (
                <span className="notif-badge">{unread}</span>
              ) : null}
            </span>
            <span className="nav-user">{user.username}</span>
            <button className="btn btn-ghost" onClick={onLogout}>
              Logout
            </button>
          </>
        ) : (
          <Link to="/login" className="btn btn-ghost">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
}
