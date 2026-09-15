// src/components/layout/NavBar.jsx
//
// Hiding the "Admin" link here for non-admins is a COURTESY, not a
// control - same caveat as auth/RequireAdmin.jsx. The /admin/* routes are
// still wrapped in <RequireAdmin>, and the actual admin API endpoints
// independently re-check the role server-side regardless of what this
// nav bar shows or hides.
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';

export function NavBar() {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/">Meeting Rooms</Link>
      </div>
      {status === 'authenticated' && (
        <div className="navbar-links">
          <Link to="/">Search</Link>
          <Link to="/bookings/new-series">Book a series</Link>
          <Link to="/my-bookings">My bookings</Link>
          {user.role === 'ADMIN' && (
            <>
              <Link to="/admin/utilisation">Utilisation</Link>
              <Link to="/admin/rooms">Manage rooms</Link>
            </>
          )}
          <span className="navbar-user">{user.email}</span>
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
