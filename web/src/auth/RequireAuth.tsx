// src/auth/RequireAuth.tsx
//
// IMPORTANT: this guard only decides what RENDERS in the browser. It is
// NOT a security boundary - a user can edit React state in devtools, or
// hit the API directly with curl/Postman, bypassing this component
// entirely. The backend's `authenticate` middleware (which checks a real,
// signed JWT on every protected request - see api/src/middleware/authenticate.ts)
// is the ONLY real enforcement. This guard exists purely so a legitimate
// user doesn't land on a broken page or see dead-end buttons for actions
// they can't perform - it's a courtesy, not a control. This directly
// echoes the spec's own warning: "hiding a button in the frontend does
// not protect an operation."
import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from './AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();

  // 'checking' is the one moment the app is allowed to show a blocking
  // loading state - waiting here (rather than immediately redirecting to
  // /login) is what prevents a protected route from FLASHING a redirect
  // before the mount-time silent refresh (AuthContext.tsx) has had a
  // chance to complete.
  if (status === 'checking') return <div className="page-loading">Loading…</div>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;

  return children;
}
