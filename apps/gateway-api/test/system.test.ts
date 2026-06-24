import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  buildTestApp,
  registerUser,
  authHeader,
  type TestHarness,
} from "./helpers.js";

describe("system endpoints & notifications", () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await buildTestApp();
  });

  afterAll(async () => {
    await h.app.close();
  });

  it("GET /health returns ok", async () => {
    const res = await h.app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /ready returns ready when the db is up", async () => {
    const res = await h.app.inject({ method: "GET", url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready" });
  });

  it("GET /metrics returns prometheus text", async () => {
    const res = await h.app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("http_request_duration_seconds");
  });

  it("CORS is enabled", async () => {
    const res = await h.app.inject({
      method: "OPTIONS",
      url: "/api/rooms",
      headers: { origin: "http://example.com", "access-control-request-method": "GET" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeTruthy();
  });

  it("GET /api/notifications requires auth", async () => {
    const res = await h.app.inject({ method: "GET", url: "/api/notifications" });
    expect(res.statusCode).toBe(401);
  });

  it("GET /api/notifications returns an array for the authed user", async () => {
    const { token } = await registerUser(h.app);
    const res = await h.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: authHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it("rejects a malformed bearer token with 401", async () => {
    const res = await h.app.inject({
      method: "GET",
      url: "/api/notifications",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(res.statusCode).toBe(401);
  });
});
