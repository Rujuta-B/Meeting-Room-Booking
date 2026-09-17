// src/routes/NotFoundPage.jsx
//
// Reached for any URL that doesn't match a known route. Rather than
// showing a dead-end "Page not found" screen, this sends the user
// somewhere useful based on whether they actually have a session:
// signed-in users go to the home page, and anonymous visitors go to
// /login - a bad URL should never be able to strand someone deeper than
// the app's own front door.
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export function NotFoundPage() {
  const { status } = useAuth();

  // Mirrors RequireAuth.jsx's own reasoning: wait for the mount-time
  // silent refresh to resolve before deciding where to send the user, so
  // a signed-in visitor hitting a bad URL doesn't get redirected to
  // /login just because the session check hadn't finished yet.
  if (status === 'checking') return <div className="page-loading">Loading…</div>;
  if (status === 'anonymous') return <Navigate to="/login" replace />;

  return <Navigate to="/" replace />;
}
