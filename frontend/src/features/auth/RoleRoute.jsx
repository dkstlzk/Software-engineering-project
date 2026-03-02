import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RoleRoute({ roles, children }) {
  const { hasRole } = useAuth();

  if (!hasRole(roles)) {
    return <Navigate to="/" replace />;
  }

  return children;
}
