import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  buildTestApp,
  registerUser,
  authHeader,
  uniqueSlug,
  type TestHarness,
} from "./helpers.js";
import { roomPostsCacheKey } from "../src/cache.js";

describe("rooms & posts & comments", () => {
  let h: TestHarness;
  let token: string;

  beforeAll(async () => {
    h = await buildTestApp();
    ({ token } = await registerUser(h.app));
  });

  afterAll(async () => {
    await h.app.close();
  });

  async function createRoom(): Promise<{ id: string; slug: string }> {
    const slug = uniqueSlug();
    const res = await h.app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: authHeader(token),
      payload: { slug, name: `Room ${slug}` },
    });
    expect(res.statusCode).toBe(201);
    const room = res.json();
    return { id: room.id, slug: room.slug };
  }

  it("lists rooms", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/rooms" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("requires auth to create a room", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/rooms",
      payload: { slug: uniqueSlug(), name: "Nope" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates a room and fetches it by slug", async () => {
    const { slug } = await createRoom();
    const res = await h.app.inject({ method: "GET", url: `/api/rooms/${slug}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().slug).toBe(slug);
  });

  it("returns 404 for a missing room slug", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: `/api/rooms/${uniqueSlug()}`,
    });
    expect(res.statusCode).toBe(404);
  });

  it("returns 409 for a duplicate slug", async () => {
    const { slug } = await createRoom();
    const res = await h.app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: authHeader(token),
      payload: { slug, name: "Dup" },
    });
    expect(res.statusCode).toBe(409);
  });

  it("requires auth to create a post", async () => {
    const { slug } = await createRoom();
    const res = await h.app.inject({
      method: "POST",
      url: `/api/rooms/${slug}/posts`,
      payload: { title: "t", body: "b" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("creates a post, publishes post.created, and invalidates the cache", async () => {
    const room = await createRoom();
    const cacheKey = roomPostsCacheKey(room.id);

    // Prime the cache via the list endpoint.
    const list1 = await h.app.inject({
      method: "GET",
      url: `/api/rooms/${room.slug}/posts`,
    });
    expect(list1.statusCode).toBe(200);
    expect(await h.cache.get(cacheKey)).not.toBeNull();

    const before = h.publisher.calls.length;
    const create = await h.app.inject({
      method: "POST",
      url: `/api/rooms/${room.slug}/posts`,
      headers: authHeader(token),
      payload: { title: "Hello", body: "World" },
    });
    expect(create.statusCode).toBe(201);
    const post = create.json();
    expect(post.title).toBe("Hello");
    expect(post.score).toBe(0);

    // Cache invalidated.
    expect(await h.cache.get(cacheKey)).toBeNull();

    // Publisher called with post.created.
    const newCalls = h.publisher.calls.slice(before);
    const published = newCalls.find((c) => c.type === "post.created");
    expect(published).toBeDefined();
    expect(published?.payload).toMatchObject({
      postId: post.id,
      roomId: room.id,
      title: "Hello",
    });
  });

  it("serves the post list from cache when present", async () => {
    const room = await createRoom();

    await h.app.inject({
      method: "POST",
      url: `/api/rooms/${room.slug}/posts`,
      headers: authHeader(token),
      payload: { title: "First", body: "b" },
    });

    // First call populates the cache.
    const r1 = await h.app.inject({
      method: "GET",
      url: `/api/rooms/${room.slug}/posts`,
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toHaveLength(1);

    // Insert a second post directly through the publisher-less path would
    // invalidate the cache, so instead overwrite the cache with a sentinel and
    // confirm it is served verbatim.
    await h.cache.set(
      roomPostsCacheKey(room.id),
      JSON.stringify([{ id: "sentinel", title: "cached", body: "", score: 0, authorUsername: "x", commentCount: 0, createdAt: new Date().toISOString() }]),
      30,
    );
    const r2 = await h.app.inject({
      method: "GET",
      url: `/api/rooms/${room.slug}/posts`,
    });
    expect(r2.statusCode).toBe(200);
    expect(r2.json()[0].id).toBe("sentinel");
  });

  it("fetches a post with author username, comments and comment counts", async () => {
    const room = await createRoom();
    const created = await h.app.inject({
      method: "POST",
      url: `/api/rooms/${room.slug}/posts`,
      headers: authHeader(token),
      payload: { title: "WithComments", body: "b" },
    });
    const post = created.json();

    // Add a comment (auth required).
    const noAuth = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/comments`,
      payload: { body: "hi" },
    });
    expect(noAuth.statusCode).toBe(401);

    const beforeComment = h.publisher.calls.length;
    const comment = await h.app.inject({
      method: "POST",
      url: `/api/posts/${post.id}/comments`,
      headers: authHeader(token),
      payload: { body: "hi there" },
    });
    expect(comment.statusCode).toBe(201);
    const commentBody = comment.json();
    expect(commentBody.body).toBe("hi there");

    const published = h.publisher.calls
      .slice(beforeComment)
      .find((c) => c.type === "comment.created");
    expect(published).toBeDefined();
    expect(published?.payload).toMatchObject({
      commentId: commentBody.id,
      postId: post.id,
    });

    const detail = await h.app.inject({ method: "GET", url: `/api/posts/${post.id}` });
    expect(detail.statusCode).toBe(200);
    const detailBody = detail.json();
    expect(detailBody.post.id).toBe(post.id);
    expect(detailBody.post.authorUsername).toBeTruthy();
    expect(detailBody.comments).toHaveLength(1);
    expect(detailBody.comments[0].authorUsername).toBeTruthy();

    // Post list should now report commentCount = 1 for this post.
    const list = await h.app.inject({
      method: "GET",
      url: `/api/rooms/${room.slug}/posts`,
    });
    const item = list.json().find((p: { id: string }) => p.id === post.id);
    expect(item.commentCount).toBe(1);
  });

  it("returns 404 for a missing post", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/posts/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
  });
});
