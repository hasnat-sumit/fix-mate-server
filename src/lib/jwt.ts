import { createLocalJWKSet, errors, jwtVerify, type JSONWebKeySet, type JWTVerifyGetKey } from "jose";
import { env } from "../config/env.js";
import { getAuth } from "./auth.js";

const KEY_SET_TTL_MS = 5 * 60_000;
/** Minimum gap between forced reloads, so tokens with unknown key IDs cannot trigger a reload on every request. */
const MIN_RELOAD_INTERVAL_MS = 30_000;

let keySet: { getKey: JWTVerifyGetKey; loadedAt: number } | undefined;

/**
 * Reads the public keys in-process from Better Auth (the same data served at /api/auth/jwks),
 * which avoids an HTTP round trip from the server to itself.
 */
async function loadKeySet() {
  const jwks = await getAuth().api.getJwks();
  keySet = { getKey: createLocalJWKSet(jwks as JSONWebKeySet), loadedAt: Date.now() };
  return keySet.getKey;
}

async function currentKeySet() {
  if (keySet && Date.now() - keySet.loadedAt < KEY_SET_TTL_MS) return keySet.getKey;
  return loadKeySet();
}

const verifyOptions = {
  algorithms: ["EdDSA"],
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  clockTolerance: 30,
};

/**
 * Verifies an API access token issued by Better Auth's JWT plugin.
 * Throws a `jose` error (an instance of `errors.JOSEError`) when the token is invalid or expired.
 */
export async function verifyAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, await currentKeySet(), verifyOptions);
    return payload;
  } catch (error) {
    // After a key rotation, a valid token can carry a key ID that is newer than the cached set.
    const canReload = !keySet || Date.now() - keySet.loadedAt >= MIN_RELOAD_INTERVAL_MS;
    if (error instanceof errors.JWKSNoMatchingKey && canReload) {
      const { payload } = await jwtVerify(token, await loadKeySet(), verifyOptions);
      return payload;
    }
    throw error;
  }
}

export const isTokenError = (error: unknown) => error instanceof errors.JOSEError;
