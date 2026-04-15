const apiUrlFromEnv =
	import.meta.env.NEXT_PUBLIC_API_URL ??
	import.meta.env.VITE_API_BASE_URL ??
	"/api";

const sanitizedApiBaseUrl = apiUrlFromEnv.trim();

export const API_BASE_URL = (sanitizedApiBaseUrl.length > 0 ? sanitizedApiBaseUrl : "/api").replace(/\/$/, "");
export const AUTH_TOKEN_KEY = "authAccessToken";
export const AUTH_REFRESH_TOKEN_KEY = "authRefreshToken";
export const AUTH_USER_KEY = "authUser";
export const LAST_ACTIVITY_KEY = "lastActivity";
export const REMEMBER_ME_KEY = "rememberMe";
