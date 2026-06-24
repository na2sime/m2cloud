import { describe, it, expect } from "vitest";
import { signToken, verifyToken } from "../src/jwt.js";

describe("jwt", () => {
  it("round-trips a payload", async () => {
    const secret = "test-secret-0123456789";
    const token = await signToken({ sub: "u1", username: "alice" }, secret);
    const decoded = await verifyToken(token, secret);
    expect(decoded.sub).toBe("u1");
    expect(decoded.username).toBe("alice");
  });

  it("rejects a tampered token", async () => {
    await expect(verifyToken("bad.token.here", "s")).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken({ sub: "u1", username: "alice" }, "secret-a-0123456789");
    await expect(verifyToken(token, "secret-b-0123456789")).rejects.toThrow();
  });
});
