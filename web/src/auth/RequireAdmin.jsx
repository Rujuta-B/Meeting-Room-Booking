// src/auth/RequireAdmin.jsx
//
// Same UX-only caveat as RequireAuth.jsx applies here, doubly so: the
// REAL admin-only enforcement is api/src/middleware/requireAdmin.ts,
// which checks the role embedded in the signed JWT server-side on every
// admin request. This component only avoids showing a USER an admin
// screen they'd get a 403 from anyway.
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import { ForbiddenPage } from '../routes/ForbiddenPage.jsx';

export function RequireAdmin({ children }) {
  const { status, user } = useAuth();

  if (status === 'checking') return <div className="page-loading">Loading…</div>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  // Rendered in place (not a redirect) so a non-admin who types an admin
  // URL directly sees a clear explanation instead of silently landing on
  // the search page with no idea why.
  if (user.role !== 'ADMIN') return <ForbiddenPage />;

  return children;
}
