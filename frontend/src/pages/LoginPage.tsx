import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Loader2 } from "lucide-react";
import { formatError } from "../utils/formatError";

interface ToastProps {
  type: "error" | "success";
  message: string;
  onDismiss: () => void;
  retryCountdownSeconds?: number;
  nextLoginTime?: string;
}

function Toast({ type, message, onDismiss, retryCountdownSeconds, nextLoginTime }: ToastProps) {
  const [countdown, setCountdown] = useState(retryCountdownSeconds ?? 0);

  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  useEffect(() => {
    if (countdown <= 0) return;
    
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown]);

  const bgColor = type === "error" ? "bg-destructive/90" : "bg-green-600/90";
  const textColor = "text-white";
  const displayMessage = countdown > 0 ? `${message} (${countdown}s)` : message;

  return (
    <div
      className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg ${bgColor} ${textColor} shadow-lg animate-in fade-in slide-in-from-bottom-4 z-50`}
    >
      <div>{displayMessage}</div>
      {nextLoginTime && (
        <div className="text-sm mt-2 opacity-90">
          Next login available: {nextLoginTime}
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { user, login, loginWithGoogle } = useAuth();
  const [authMethod, setAuthMethod] = useState<"email" | "google">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailLoading, setEmailLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [toast, setToast] = useState<{
    type: "error" | "success";
    message: string;
    retryCountdownSeconds?: number;
    nextLoginTime?: string;
  } | null>(null);

  // Check for OAuth error in URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hasOAuthError = searchParams.get("error") === "oauth_failed";
    
    if (hasOAuthError) {
      const timer = setTimeout(() => {
        setToast({
          type: "error",
          message: "Google sign-in failed. Please try again.",
        });
        // Clean up URL
        window.history.replaceState({}, "", "/login");
      }, 0);
      
      return () => clearTimeout(timer);
    }
  }, []);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleEmailLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setToast({
        type: "error",
        message: "Please enter your email address.",
      });
      return;
    }

    if (!email.endsWith("@iitj.ac.in")) {
      setToast({
        type: "error",
        message: "Please use your @iitj.ac.in email address.",
      });
      return;
    }

    if (!password) {
      setToast({
        type: "error",
        message: "Please enter your password.",
      });
      return;
    }

    try {
      setEmailLoading(true);
      await login(email.trim(), password, "email");
      // Navigation will happen via useEffect when user state updates
    } catch (error) {
      const errorMessage = formatError(error, "Login failed. Please check your credentials.");
      const retryMatch = errorMessage.match(/Try again in (\d+) second/);
      const retryCountdownSeconds = retryMatch ? parseInt(retryMatch[1], 10) : undefined;
      
      let nextLoginTime: string | undefined;
      if (retryCountdownSeconds) {
        const now = new Date();
        const nextLoginDate = new Date(now.getTime() + retryCountdownSeconds * 1000);
        nextLoginTime = nextLoginDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      }
      
      setToast({
        type: "error",
        message: errorMessage,
        retryCountdownSeconds,
        nextLoginTime,
      });
      setEmailLoading(false);
    }
  }, [email, password, login]);

  const handleGoogleLogin = useCallback(async () => {
    try {
      setGoogleLoading(true);
      await loginWithGoogle();
    } catch {
      setToast({
        type: "error",
        message: "Failed to initiate Google sign-in. Please try again.",
      });
      setGoogleLoading(false);
    }
  }, [loginWithGoogle]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">URA System</h1>
          <p className="text-gray-600">Room Availability Management</p>
        </div>

        {/* Login Card */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Choose your preferred login method
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Auth Method Selector */}
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <Label className="text-sm font-medium text-gray-700">Login Method</Label>
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="email-method"
                    name="authMethod"
                    value="email"
                    checked={authMethod === "email"}
                    onChange={(e) => setAuthMethod(e.target.value as "email" | "google")}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="email-method" className="ml-3 cursor-pointer text-sm">
                    Email / Password
                  </Label>
                </div>
                <div className="flex items-center">
                  <input
                    type="radio"
                    id="google-method"
                    name="authMethod"
                    value="google"
                    checked={authMethod === "google"}
                    onChange={(e) => setAuthMethod(e.target.value as "email" | "google")}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="google-method" className="ml-3 cursor-pointer text-sm">
                    Google OAuth
                  </Label>
                </div>
              </div>
            </div>

            {/* Email/Password Form - Only shown when email method selected */}
            {authMethod === "email" && (
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@iitj.ac.in"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={emailLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={emailLoading}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full"
                >
                  {emailLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign in with Email"
                  )}
                </Button>
              </form>
            )}

            {/* Google OAuth Section - Only shown when google method selected */}
            {authMethod === "google" && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Sign in using your Google account. Make sure to use your @iitj.ac.in email.
                </p>
                <Button
                  onClick={handleGoogleLogin}
                  disabled={googleLoading}
                  variant="outline"
                  className="w-full h-10"
                >
                  {googleLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <svg
                        className="mr-2 h-4 w-4"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          fill="#4285F4"
                        />
                        <path
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          fill="#34A853"
                        />
                        <path
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                          fill="#FBBC05"
                        />
                        <path
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                          fill="#EA4335"
                        />
                      </svg>
                      Sign in with Google
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footer Links */}
        <div className="mt-8 text-center space-y-4">
          <p className="text-sm text-gray-600">
            Don't have an account?{" "}
            <a href="mailto:support@uras.app" className="text-blue-600 hover:text-blue-700 font-medium">
              Contact support
            </a>
          </p>

          <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
            <span>Terms of Service</span>
            <span>•</span>
            <span>Privacy Policy</span>
          </div>
        </div>
      </div>

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          retryCountdownSeconds={toast.retryCountdownSeconds}
          nextLoginTime={toast.nextLoginTime}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
