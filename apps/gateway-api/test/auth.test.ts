import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestApp, uniqueUser, type TestHarness } from "./helpers.js";

describe("auth", () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await buildTestApp();
  });

  afterAll(async () => {
    await h.app.close();
  });

  it("registers a new user and returns a token", async () => {
    const creds = uniqueUser();
    const res = await h.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: creds,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.username).toBe(creds.username);
    expect(body.user.email).toBe(creds.email);
    expect(body.user.id).toBeTruthy();
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects invalid register body with 400", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", username: "", password: "x" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("returns 409 for duplicate email", async () => {
    const creds = uniqueUser();
    const first = await h.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: creds,
    });
    expect(first.statusCode).toBe(201);

    const dup = await h.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...creds, username: `${creds.username}-2` },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("returns 409 for duplicate username", async () => {
    const creds = uniqueUser();
    await h.app.inject({ method: "POST", url: "/api/auth/register", payload: creds });

    const dup = await h.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { ...creds, email: `other-${creds.email}` },
    });
    expect(dup.statusCode).toBe(409);
  });

  it("logs in with correct credentials", async () => {
    const creds = uniqueUser();
    await h.app.inject({ method: "POST", url: "/api/auth/register", payload: creds });

    const res = await h.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: creds.email, password: creds.password },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(typeof body.token).toBe("string");
    expect(body.user.email).toBe(creds.email);
  });

  it("returns 401 for wrong password", async () => {
    const creds = uniqueUser();
    await h.app.inject({ method: "POST", url: "/api/auth/register", payload: creds });

    const res = await h.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: creds.email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 for unknown email", async () => {
    const res = await h.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.test", password: "whatever" },
    });
    expect(res.statusCode).toBe(401);
  });
});
