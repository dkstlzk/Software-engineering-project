import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { isProfileSetupRequiredForUser } from "../../auth/profileSetup";

export function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Prevent PENDING_ROLE users from accessing the app
  if (user.role === "PENDING_ROLE") {
    return <Navigate to="/auth/setup" replace />;
  }

  const needsProfileSetup = isProfileSetupRequiredForUser(user.id);
  if (needsProfileSetup && location.pathname !== "/profile/setup") {
    return <Navigate to="/profile/setup" replace />;
  }

  if (!needsProfileSetup && location.pathname === "/profile/setup") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
