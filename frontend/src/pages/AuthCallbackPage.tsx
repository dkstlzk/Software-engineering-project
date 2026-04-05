import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { markProfileSetupRequired } from "../auth/profileSetup";
import { getAuthUser } from "../lib/api";
import { formatError } from "../utils/formatError";

type CallbackState = "loading" | "error" | "success";

type PendingOAuthPayload = {
  accessToken: string;
  refreshToken: string | null;
  isFirstLogin: boolean;
};

const CALLBACK_TIMEOUT_MS = 15000;
const PENDING_OAUTH_PAYLOAD_KEY = "pendingOAuthPayload";

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function readPendingOAuthPayload(): PendingOAuthPayload | null {
  const raw = sessionStorage.getItem(PENDING_OAUTH_PAYLOAD_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PendingOAuthPayload>;
    if (typeof parsed.accessToken !== "string" || parsed.accessToken.length === 0) {
      return null;
    }

    return {
      accessToken: parsed.accessToken,
      refreshToken:
        typeof parsed.refreshToken === "string" && parsed.refreshToken.length > 0
          ? parsed.refreshToken
          : null,
      isFirstLogin: parsed.isFirstLogin === true,
    };
  } catch {
    return null;
  }
}

function writePendingOAuthPayload(payload: PendingOAuthPayload): void {
  sessionStorage.setItem(PENDING_OAUTH_PAYLOAD_KEY, JSON.stringify(payload));
}

function clearPendingOAuthPayload(): void {
  sessionStorage.removeItem(PENDING_OAUTH_PAYLOAD_KEY);
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [state, setState] = useState<CallbackState>("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isFirstLoginFlow, setIsFirstLoginFlow] = useState(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const error = searchParams.get("error");

    const accessTokenFromUrl = searchParams.get("accessToken");
    const refreshTokenFromUrl = searchParams.get("refreshToken");
    const isFirstLoginFromUrl = searchParams.get("firstLogin") === "true";

    if (accessTokenFromUrl) {
      writePendingOAuthPayload({
        accessToken: accessTokenFromUrl,
        refreshToken: refreshTokenFromUrl,
        isFirstLogin: isFirstLoginFromUrl,
      });

      // Strip tokens from URL immediately after capture.
      window.history.replaceState({}, "", "/auth/callback");
    }

    const pending = accessTokenFromUrl
      ? {
          accessToken: accessTokenFromUrl,
          refreshToken: refreshTokenFromUrl,
          isFirstLogin: isFirstLoginFromUrl,
        }
      : readPendingOAuthPayload();

    if (getAuthUser() && !pending?.accessToken && !error) {
      navigate("/");
      return;
    }

    if (error === "oauth_failed") {
      clearPendingOAuthPayload();
      setState("error");
      setErrorMessage("Google sign-in failed. Please try again.");
      return;
    }

    if (!pending?.accessToken) {
      clearPendingOAuthPayload();
      setState("error");
      setErrorMessage("Missing OAuth token. Please try signing in again.");
      return;
    }

    let isCancelled = false;
    let redirectTimeout: number | null = null;

    (async () => {
      try {
        setState("loading");
        setErrorMessage("");

        localStorage.setItem("authAccessToken", pending.accessToken);
        if (pending.refreshToken) {
          localStorage.setItem("authRefreshToken", pending.refreshToken);
        }

        await withTimeout(
          loginWithToken(pending.accessToken),
          CALLBACK_TIMEOUT_MS,
          "Sign-in is taking too long. Verify backend API is running on http://localhost:5000, then try again.",
        );

        if (isCancelled) {
          return;
        }

        const authUser = getAuthUser();
        if (pending.isFirstLogin && authUser?.id) {
          markProfileSetupRequired(authUser.id);
        }

        clearPendingOAuthPayload();
        setIsFirstLoginFlow(pending.isFirstLogin);
        setState("success");

        redirectTimeout = window.setTimeout(() => {
          if (!isCancelled) {
            navigate(pending.isFirstLogin ? "/profile/setup" : "/");
          }
        }, 500);
      } catch (err) {
        if (isCancelled) {
          return;
        }

        clearPendingOAuthPayload();
        setState("error");
        setErrorMessage(formatError(err, "Authentication failed. Please try again."));
      }
    })();

    return () => {
      isCancelled = true;
      if (redirectTimeout !== null) {
        window.clearTimeout(redirectTimeout);
      }
    };
  }, [loginWithToken, navigate]);

  if (state === "error") {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-red-100 p-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">Authentication Failed</h1>

          <p className="text-center text-slate-600 mb-6">{errorMessage}</p>

          <div className="space-y-3">
            <button
              onClick={() => navigate("/login")}
              className="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Back to Login
            </button>

            <button
              onClick={() => navigate("/")}
              className="w-full px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state === "success") {
    return (
      <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
          <div className="flex justify-center mb-6">
            <div className="rounded-full bg-green-100 p-4">
              <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">Sign In Successful</h1>

          <p className="text-slate-600">
            {isFirstLoginFlow
              ? "Redirecting you to profile setup..."
              : "Redirecting you to your dashboard..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg">
        <div className="flex justify-center mb-6">
          <div className="rounded-full bg-blue-100 p-4">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-slate-900 mb-2">Completing Sign In</h1>

        <p className="text-center text-slate-600 mb-8">Please wait while we verify your credentials...</p>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full bg-blue-600 animate-pulse"></div>
            <span className="text-sm text-slate-600">Verifying authentication</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full bg-slate-300"></div>
            <span className="text-sm text-slate-600">Setting up your session</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full bg-slate-300"></div>
            <span className="text-sm text-slate-600">Redirecting you</span>
          </div>
        </div>
      </div>
    </div>
  );
}
