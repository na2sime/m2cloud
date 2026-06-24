import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  buildTestApp,
  registerUser,
  authHeader,
  uniqueSlug,
  type TestHarness,
} from "./helpers.js";

describe("votes", () => {
  let h: TestHarness;
  let token: string;

  beforeAll(async () => {
    h = await buildTestApp();
    ({ token } = await registerUser(h.app));
  });

  afterAll(async () => {
    await h.app.close();
  });

  async function createPost(): Promise<{ id: string; roomSlug: string }> {
    const slug = uniqueSlug();
    const room = await h.app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: authHeader(token),
      payload: { slug, name: `Room ${slug}` },
    });
    const roomBody = room.json();
    const post = await h.app.inject({
      method: "POST",
      url: `/api/rooms/${roomBody.slug}/posts`,
      headers: authHeader(token),
      payload: { title: "Vote me", body: "b" },
    });
    return { id: post.json().id, roomSlug: roomBody.slug };
  }

  it("requires auth to vote", async () => {
    const post = await createPost();
    const res = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      payload: { value: 1 },
    });
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid vote values with 400", async () => {
    const post = await createPost();
    const res = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      headers: authHeader(token),
      payload: { value: 5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("upserts a post vote: re-voting changes the score, never doubles", async () => {
    const post = await createPost();

    const up = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      headers: authHeader(token),
      payload: { value: 1 },
    });
    expect(up.statusCode).toBe(200);
    expect(up.json().score).toBe(1);

    // Same user votes again upward: score must stay 1 (upsert, not insert).
    const again = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      headers: authHeader(token),
      payload: { value: 1 },
    });
    expect(again.json().score).toBe(1);

    // Switch to downvote: score flips to -1.
    const down = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      headers: authHeader(token),
      payload: { value: -1 },
    });
    expect(down.json().score).toBe(-1);

    // The persisted post score reflects the latest aggregate.
    const detail = await h.app.inject({ method: "GET", url: `/api/posts/${post.id}` });
    expect(detail.json().post.score).toBe(-1);

    // A vote.cast event was published.
    const cast = h.publisher.calls.filter((c) => c.type === "vote.cast");
    expect(cast.length).toBeGreaterThanOrEqual(3);
  });

  it("aggregates votes from multiple users on a post", async () => {
    const post = await createPost();
    const { token: token2 } = await registerUser(h.app);

    await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      headers: authHeader(token),
      payload: { value: 1 },
    });
    const second = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/vote`,
      headers: authHeader(token2),
      payload: { value: 1 },
    });
    expect(second.json().score).toBe(2);
  });

  it("upserts a comment vote and persists comment score", async () => {
    const post = await createPost();
    const comment = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/comments`,
      headers: authHeader(token),
      payload: { body: "vote on me" },
    });
    const commentId = comment.json().id;

    const up = await h.app.inject({
      method: "POST",
      url: `/api/comments/${commentId}/vote`,
      headers: authHeader(token),
      payload: { value: 1 },
    });
    expect(up.json().score).toBe(1);

    const reup = await h.app.inject({
      method: "POST",
      url: `/api/comments/${commentId}/vote`,
      headers: authHeader(token),
      payload: { value: 1 },
    });
    expect(reup.json().score).toBe(1);

    const detail = await h.app.inject({ method: "GET", url: `/api/posts/${post.id}` });
    const c = detail.json().comments.find((x: { id: string }) => x.id === commentId);
    expect(c.score).toBe(1);
  });

  it("returns 404 voting on a missing post", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/posts/00000000-0000-0000-0000-000000000000/vote",
      headers: authHeader(token),
      payload: { value: 1 },
    });
    expect(res.statusCode).toBe(404);
  });
});
