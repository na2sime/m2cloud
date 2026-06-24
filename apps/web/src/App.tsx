// Application shell: nav + routed pages. Auth-only pages are wrapped with
// RequireAuth.

import { Navigate, Route, Routes } from "react-router-dom";
import { Nav } from "./components/Nav.js";
import { RequireAuth } from "./components/RequireAuth.js";
import { Login } from "./pages/Login.js";
import { Post } from "./pages/Post.js";
import { Room } from "./pages/Room.js";
import { Rooms } from "./pages/Rooms.js";

export function App() {
  return (
    <div className="app">
      <Nav />
      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/rooms" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/rooms"
            element={
              <RequireAuth>
                <Rooms />
              </RequireAuth>
            }
          />
          <Route
            path="/rooms/:slug"
            element={
              <RequireAuth>
                <Room />
              </RequireAuth>
            }
          />
          <Route
            path="/posts/:id"
            element={
              <RequireAuth>
                <Post />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/rooms" replace />} />
        </Routes>
      </main>
    </div>
  );
}
