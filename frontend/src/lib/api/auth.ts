import { API_BASE_URL } from "./constants";
import {
  request,
  setAuthSession,
  clearAuth,
  httpErrorMessage,
  getRetryAfterSeconds,
} from "./client";
import type { AuthUser, SetupRole, LoginResponse, ApiErrorPayload } from "./types";
import { formatError } from "../../utils/formatError";

export async function login(email: string, password: string, authProvider: string = "email"): Promise<AuthUser> {
  const response = await request<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, authProvider }),
  });

  setAuthSession(response.accessToken, response.refreshToken, response.user);

  return response.user;
}

export async function startGoogleOAuthLogin(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/google`, {
    method: "GET",
    redirect: "manual",
  });

  if (response.type === "opaqueredirect") {
    window.location.assign(`${API_BASE_URL}/auth/google`);
    return;
  }

  if (response.status >= 300 && response.status < 400) {
    const redirectLocation = response.headers.get("location");

    if (redirectLocation) {
      window.location.assign(redirectLocation);
      return;
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const apiPayload = payload as ApiErrorPayload | null;
    const retryAfterSeconds = response.status === 429 
      ? getRetryAfterSeconds(response)
      : null;
    const message = formatError(
      apiPayload?.error ?? apiPayload?.message ?? payload,
      httpErrorMessage(response.status, retryAfterSeconds),
    );

    throw new Error(message);
  }

  window.location.assign(`${API_BASE_URL}/auth/google`);
}

export async function loginWithOAuthToken(token: string): Promise<AuthUser> {
  localStorage.setItem("authAccessToken", token);

  try {
    const user = await request<AuthUser>("/auth/me");
    // For OAuth, if refreshToken wasn't already set, use empty string
    if (!localStorage.getItem("authRefreshToken")) {
      localStorage.setItem("authRefreshToken", "");
    }
    localStorage.setItem("authUser", JSON.stringify(user));
    return user;
  } catch (error) {
    clearAuth();
    throw error;
  }
}

export async function completeOAuthSetup(input: {
  setupToken: string;
  role: SetupRole;
  department?: string;
}): Promise<AuthUser> {
  const response = await fetch(`${API_BASE_URL}/auth/complete-setup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.setupToken}`,
    },
    body: JSON.stringify({
      role: input.role,
      ...(input.department ? { department: input.department } : {}),
    }),
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const apiPayload = payload as ApiErrorPayload | null;
    const message = formatError(
      apiPayload?.error ?? apiPayload?.message ?? payload,
      httpErrorMessage(response.status),
    );

    throw new Error(message);
  }

  const loginResponse = payload as LoginResponse;
  setAuthSession(loginResponse.accessToken, loginResponse.refreshToken, loginResponse.user);

  return loginResponse.user;
}
