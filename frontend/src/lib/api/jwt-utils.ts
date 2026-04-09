/**
 * JWT utility functions for token parsing and validation.
 * Parses JWT without external dependencies using base64 decoding.
 */

export interface TokenPayload {
  id: number;
  role: string;
  type: "access" | "refresh";
  iat: number;
  exp: number;
}

/**
 * Decode a JWT token (without verification - just decode the payload)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    let payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payloadBase64.length % 4 !== 0) {
      payloadBase64 += "=";
    }

    const decoded = JSON.parse(
      atob(payloadBase64)
    );

    if (
      typeof decoded.id === "number" &&
      typeof decoded.role === "string" &&
      typeof decoded.exp === "number"
    ) {
      return decoded as TokenPayload;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Check if token exists and is valid (not malformed)
 */
export function isValidToken(token: string | null): token is string {
  if (!token) return false;
  return decodeToken(token) !== null;
}

/**
 * Get token expiry time in milliseconds
 */
export function getTokenExpiry(token: string): number | null {
  const payload = decodeToken(token);
  if (!payload) return null;
  return payload.exp * 1000;
}

/**
 * Check if token is expiring within the given threshold (milliseconds)
 * Default threshold: 2 minutes
 */
export function isTokenExpiring(
  token: string,
  thresholdMs: number = 2 * 60 * 1000
): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;

  const now = Date.now();
  return expiry - now < thresholdMs;
}

/**
 * Check if token is already expired
 */
export function isTokenExpired(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() > expiry;
}

/**
 * Get time until token expires in milliseconds
 */
export function getTimeUntilExpiry(token: string): number | null {
  const expiry = getTokenExpiry(token);
  if (!expiry) return null;

  const timeLeft = expiry - Date.now();
  return timeLeft > 0 ? timeLeft : 0;
}

/**
 * Get token type (access or refresh)
 */
export function getTokenType(token: string): "access" | "refresh" | null {
  const payload = decodeToken(token);
  return payload?.type ?? null;
}
