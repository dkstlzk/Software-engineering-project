import { Link, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import type { UserRole } from "../../lib/api/types";

interface RequireRoleProps {
  roles: UserRole[];
}

export function RequireRole({ roles }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.role)) {
    return <AccessDenied requiredRoles={roles} userRole={user.role} />;
  }

  return <Outlet />;
}

interface AccessDeniedProps {
  requiredRoles: UserRole[];
  userRole: UserRole;
}

function AccessDenied({ requiredRoles, userRole }: AccessDeniedProps) {
  return (
    <div className="flex items-center justify-center w-full h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md p-8 bg-white rounded-lg shadow-lg text-center">
        <div className="text-6xl font-bold text-red-600 mb-4">403</div>

        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access Denied</h1>

        <p className="text-slate-600 mb-4">
          Your current role ({userRole}) does not have permission to access this page.
        </p>

        <p className="text-sm text-slate-500 mb-6">
          Required role{requiredRoles.length > 1 ? "s" : ""}: {requiredRoles.join(", ")}
        </p>

        <div className="space-y-3">
          <Link
            to="/"
            className="block px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Back to Dashboard
          </Link>

          <Link
            to="/login"
            className="block px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Sign In with Different Account
          </Link>
        </div>
      </div>
    </div>
  );
}
