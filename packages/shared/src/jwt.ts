import { SignJWT, jwtVerify } from "jose";

export interface JwtPayload {
  sub: string;
  username: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: JwtPayload,
  secret: string,
  expiresIn = "7d",
): Promise<string> {
  return new SignJWT({ username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey(secret));
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret));
  if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
    throw new Error("Invalid token payload");
  }
  return { sub: payload.sub, username: payload.username };
}
