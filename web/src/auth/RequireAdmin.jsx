// src/auth/RequireAdmin.jsx
//
// Same UX-only caveat as RequireAuth.jsx applies here, doubly so: the
// REAL admin-only enforcement is api/src/middleware/requireAdmin.ts,
// which checks the role embedded in the signed JWT server-side on every
// admin request. This component only avoids showing a USER an admin
// screen they'd get a 403 from anyway.
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export function RequireAdmin({ children }) {
  const { status, user } = useAuth();

  if (status === 'checking') return <div className="page-loading">Loading…</div>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />;

  return children;
}
