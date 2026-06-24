// Post detail page: post body + votes, comment list with votes, comment form.

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "../api.js";
import { VoteButtons } from "../components/VoteButtons.js";
import type { CommentItem, PostDetail } from "../types.js";

export function Post() {
  const { id = "" } = useParams<{ id: string }>();

  const [data, setData] = useState<PostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await api.getPost(id));
    } catch (err) {
      setLoadError(
        err instanceof ApiError ? err.message : "Failed to load post",
      );
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const onComment = async (e: FormEvent) => {
    e.preventDefault();
    const text = comment.trim();
    if (!text) return;
    setSubmitting(true);
    setCommentError(null);
    try {
      const created = await api.createComment(id, { body: text });
      setData((prev) =>
        prev ? { ...prev, comments: [...prev.comments, created] } : prev,
      );
      setComment("");
    } catch (err) {
      setCommentError(
        err instanceof ApiError ? err.message : "Failed to add comment",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;
  if (loadError)
    return <div className="page"><p className="error">{loadError}</p></div>;
  if (!data)
    return <div className="page"><p className="error">Post not found.</p></div>;

  const { post, comments } = data;

  return (
    <div className="page">
      <article className="card post-detail">
        <div className="post-detail-head">
          <VoteButtons
            score={post.score}
            onVote={(value) => api.votePost(post.id, value)}
          />
          <div className="post-detail-body">
            <h1>{post.title}</h1>
            <p className="list-meta">by {post.authorUsername}</p>
            <p className="post-text">{post.body}</p>
          </div>
        </div>
      </article>

      <section className="card">
        <h2 className="card-title">Add a comment</h2>
        <form className="form" onSubmit={onComment}>
          <textarea
            rows={3}
            required
            placeholder="Your comment…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? "Posting…" : "Comment"}
          </button>
        </form>
        {commentError ? <p className="error">{commentError}</p> : null}
      </section>

      <section>
        <h2 className="section-title">
          {comments.length} comment{comments.length === 1 ? "" : "s"}
        </h2>
        {comments.length === 0 ? (
          <p className="muted">No comments yet.</p>
        ) : (
          <ul className="list">
            {comments.map((c: CommentItem) => (
              <li key={c.id} className="list-item comment-row">
                <VoteButtons
                  score={c.score}
                  onVote={(value) => api.voteComment(c.id, value)}
                />
                <div className="comment-main">
                  <p className="list-meta">{c.authorUsername}</p>
                  <p className="comment-body">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
