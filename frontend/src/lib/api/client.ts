import { API_BASE_URL, AUTH_TOKEN_KEY, AUTH_REFRESH_TOKEN_KEY, AUTH_USER_KEY } from "./constants";
import type { AuthUser, ApiErrorPayload, RefreshTokenResponse } from "./types";
import { formatError } from "../../utils/formatError";

type EnhancedApiError = Error & { status?: number };

function buildEnhancedError(message: string, status?: number): EnhancedApiError {
  const enhancedError = new Error(message) as EnhancedApiError;

  if (status !== undefined) {
    enhancedError.status = status;
  }

  return enhancedError;
}

let onUnauthorizedCallback: (() => void) | null = null;
let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

function shouldRefreshOnUnauthorized(path: string): boolean {
  return !path.startsWith("/auth/login") && !path.startsWith("/auth/refresh");
}

function buildHeaders(initHeaders: HeadersInit | undefined, token: string | null, isJson: boolean): Headers {
  const headers = new Headers(initHeaders ?? {});

  if (isJson && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return headers;
}

async function fetchWithAuth(path: string, init: RequestInit | undefined, isJson: boolean): Promise<Response> {
  const token = getAuthToken();

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildHeaders(init?.headers, token, isJson),
  });
}

export function setOnUnauthorized(cb: () => void) {
  onUnauthorizedCallback = cb;
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export function setAuthSession(accessToken: string, refreshToken: string, user: AuthUser): void {
  localStorage.setItem(AUTH_TOKEN_KEY, accessToken);
  localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

/**
 * Classify error type for better handling
 */
export type ErrorType = "network" | "auth" | "validation" | "server" | "unknown";

export function classifyError(error: unknown): ErrorType {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return "network";
  }

  if (error instanceof Error) {
    if (
      error.message.includes("401") ||
      error.message.includes("Session expired") ||
      error.message.includes("Unauthorized")
    ) {
      return "auth";
    }

    if (error.message.includes("400")) {
      return "validation";
    }

    if (error.message.includes("500")) {
      return "server";
    }
  }

  return "unknown";
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(): Promise<boolean> {
  if (isRefreshing && refreshPromise) {
    return refreshPromise;
  }

  isRefreshing = true;

  refreshPromise = (async () => {
    try {
      const refreshToken = getRefreshToken();

      if (!refreshToken) {
        return false;
      }

      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.status === 204) {
        return false;
      }

      const contentType = response.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");
      const payload = isJson ? ((await response.json()) as unknown) : null;

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          clearAuth();
          if (onUnauthorizedCallback) {
            onUnauthorizedCallback();
          }
        }
        return false;
      }

      const refreshResponse = payload as RefreshTokenResponse;
      setAuthSession(
        refreshResponse.accessToken,
        refreshResponse.refreshToken,
        refreshResponse.user
      );

      return true;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}


export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response = await fetchWithAuth(path, init, true);

  if (response.status === 401 && shouldRefreshOnUnauthorized(path)) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      response = await fetchWithAuth(path, init, true);
    }
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const status = response.status;

    // Auto-logout on 401
    if (status === 401 && shouldRefreshOnUnauthorized(path)) {
      console.warn("Session expired");
      clearAuth();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }

      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    const apiPayload = payload as ApiErrorPayload | null;
    const retryAfterSeconds = getRetryAfterSeconds(response);
    const message = formatError(
      apiPayload?.error ?? apiPayload?.message ?? payload,
      httpErrorMessage(response.status, retryAfterSeconds),
    );
    throw buildEnhancedError(message, status);
  }

  return payload as T;
}

export async function requestFormData<T>(
  path: string,
  formData: FormData,
  init?: Omit<RequestInit, "body" | "headers"> & { headers?: HeadersInit }
): Promise<T> {
  const requestInit: RequestInit = {
    ...init,
    method: init?.method ?? "POST",
    body: formData,
  };

  let response = await fetchWithAuth(path, requestInit, false);

  if (response.status === 401 && shouldRefreshOnUnauthorized(path)) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      response = await fetchWithAuth(path, requestInit, false);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const status = response.status;

    if (status === 401 && shouldRefreshOnUnauthorized(path)) {
      console.warn("Session expired");
      clearAuth();
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }

      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    const apiPayload = payload as ApiErrorPayload | null;
    const retryAfterSeconds = getRetryAfterSeconds(response);
    const message = formatError(
      apiPayload?.error ?? apiPayload?.message ?? payload,
      httpErrorMessage(response.status, retryAfterSeconds),
    );

    throw buildEnhancedError(message, status);
  }

  return payload as T;
}

export function getRetryAfterSeconds(response: Response): number | null {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return null;
  
  const seconds = parseInt(retryAfter, 10);
  return isNaN(seconds) ? null : seconds;
}

export function httpErrorMessage(status: number, retryAfterSeconds?: number | null): string {
  switch (status) {
    case 400: return "Invalid request";
    case 401: return "Session expired. Please log in again.";
    case 403: return "You don't have permission to perform this action";
    case 404: return "Resource not found";
    case 409: return "Conflict with existing data";
    case 429: {
      if (retryAfterSeconds) {
        return `Too many requests. Try again in ${retryAfterSeconds} second${retryAfterSeconds !== 1 ? 's' : ''}.`;
      }
      return "Too many requests. Please try again later.";
    }
    default:  return `Request failed (${status})`;
  }
}
