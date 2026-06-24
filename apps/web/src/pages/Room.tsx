// Room page: post list, create-post form, and a live chat panel.
// The chat joins by room slug (the realtime service keys rooms by slug).

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api.js";
import { useAuth } from "../auth.js";
import { ChatPanel } from "../components/ChatPanel.js";
import type { PostListItem, Room as RoomType } from "../types.js";

export function Room() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { token } = useAuth();

  const [room, setRoom] = useState<RoomType | null>(null);
  const [posts, setPosts] = useState<PostListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [rooms, list] = await Promise.all([
        api.listRooms(),
        api.listPosts(slug),
      ]);
      setRoom(rooms.find((r) => r.slug === slug) ?? null);
      setPosts(list);
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load room",
      );
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const post = await api.createPost(slug, {
        title: title.trim(),
        body: body.trim(),
      });
      setPosts((prev) => [post, ...prev]);
      setTitle("");
      setBody("");
    } catch (err) {
      setCreateError(
        err instanceof ApiError ? err.message : "Failed to create post",
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>{room?.name ?? slug}</h1>
        <Link to="/rooms" className="link-back">
          ← All rooms
        </Link>
      </div>
      {room?.description ? <p className="muted">{room.description}</p> : null}

      <div className="room-layout">
        <div className="room-main">
          <section className="card">
            <h2 className="card-title">New post</h2>
            <form className="form" onSubmit={onCreate}>
              <label className="field">
                <span>Title</span>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Body</span>
                <textarea
                  required
                  rows={3}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={creating}
              >
                {creating ? "Posting…" : "Post"}
              </button>
            </form>
            {createError ? <p className="error">{createError}</p> : null}
          </section>

          <section>
            {loading ? (
              <p className="muted">Loading posts…</p>
            ) : loadError ? (
              <p className="error">{loadError}</p>
            ) : posts.length === 0 ? (
              <p className="muted">No posts yet. Be the first to post.</p>
            ) : (
              <ul className="list">
                {posts.map((post) => (
                  <li key={post.id} className="list-item post-row">
                    <span className="post-score" title="Score">
                      {post.score}
                    </span>
                    <div className="post-row-main">
                      <Link to={`/posts/${post.id}`} className="list-title">
                        {post.title}
                      </Link>
                      <p className="list-desc">{post.body}</p>
                      <p className="list-meta">
                        by {post.authorUsername} · {post.commentCount} comment
                        {post.commentCount === 1 ? "" : "s"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <ChatPanel roomSlug={slug} token={token} />
      </div>
    </div>
  );
}
