import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { decryptPrivateKey } from "./crypto";
import { env } from "../config/env";
import { AuthenticationError, ValidationError } from "./error";
import z from "zod";
import { createHash, randomUUID } from "crypto";

export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  isVerified: boolean;
  iat?: number;
  exp?: number;
}

export function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  encryptedPrivateKey: string
): string {
  const privateKey: Secret = decryptPrivateKey(encryptedPrivateKey);
  if (env.JWT_ACCESS_EXPIRY == undefined) {
    throw new ValidationError("");
  }
  const options: SignOptions = {
    algorithm: "RS256",
    expiresIn: env.JWT_ACCESS_EXPIRY as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
    jwtid: randomUUID(),
  };
  return jwt.sign(payload, privateKey, options);
}

const JwtPayloadSchema = z.object({
  sub: z.string(),
  tenantId: z.string(),
  email: z.string(),
  isVerified: z.boolean(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export function verifyJwt(token: string, publicKey: string): JwtPayload {
  try {
    const verified = jwt.verify(token, publicKey, {
      algorithms: ["RS256"],
      issuer: env.JWT_ISSUER,
    });
    return JwtPayloadSchema.parse(verified);
  } catch {
    throw new AuthenticationError("Invalid or expired token");
  }
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  sessionId: string;
  iat?: number;
  exp?: number;
}

const refreshTokenPayloadSchema = z.object({
  sub: z.string(),
  tenantId: z.string(),
  sessionId: z.string(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export function signRefreshToken(
  paylaod: Omit<RefreshTokenPayload, "iat" | "exp">
): string {
  const options: SignOptions = {
    algorithm: "HS256",
    expiresIn: env.JWT_REFRESH_EXPIRY as SignOptions["expiresIn"],
    issuer: env.JWT_ISSUER,
  };

  return jwt.sign(paylaod, env.JWT_REFRESH_SECRET, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  try {
    const verified = jwt.verify(token, env.JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
      issuer: env.JWT_ISSUER,
    });
    return refreshTokenPayloadSchema.parse(verified);
  } catch {
    throw new AuthenticationError("Invalid or expired refresh token");
  }
}
