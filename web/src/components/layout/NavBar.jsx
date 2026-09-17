// src/components/layout/NavBar.jsx
//
// Hiding the "Admin" link here for non-admins is a COURTESY, not a
// control - same caveat as auth/RequireAdmin.jsx. The /admin/* routes are
// still wrapped in <RequireAdmin>, and the actual admin API endpoints
// independently re-check the role server-side regardless of what this
// nav bar shows or hides.
import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext.jsx';

function navLinkClassName({ isActive }) {
  return isActive ? 'active' : undefined;
}

const THEME_STORAGE_KEY = 'theme';
const THEME_CYCLE = { system: 'light', light: 'dark', dark: 'system' };
const THEME_ICON = { system: '🖥️', light: '☀️', dark: '🌙' };

// Reads any theme choice the user already made in an earlier visit. No
// explicit choice (the common case) means "follow the OS/browser" - see
// index.css's prefers-color-scheme block - so this deliberately returns
// null rather than guessing light/dark itself.
function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null; // localStorage can throw (private browsing, blocked storage) - fall back to "no explicit choice"
  }
}

function ThemeToggle() {
  const [theme, setTheme] = useState(() => getStoredTheme() ?? 'system');

  useEffect(() => {
    if (theme === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  function toggle() {
    // Cycle system -> light -> dark -> system, so a user can always get
    // back to "just follow my OS setting" without a separate reset control.
    const next = THEME_CYCLE[theme];
    setTheme(next);
    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Per-viewer convenience only - if storage isn't available, the
      // toggle still works for the rest of this session via component state.
    }
  }

  const label = `Theme: ${theme}. Click to change.`;

  return (
    <button type="button" className="theme-toggle" onClick={toggle} title={label} aria-label={label}>
      {THEME_ICON[theme]}
    </button>
  );
}

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
          <NavLink to="/" end className={navLinkClassName}>Search</NavLink>
          <NavLink to="/rooms" className={navLinkClassName}>Browse rooms</NavLink>
          <NavLink to="/bookings/new-series" className={navLinkClassName}>Book a series</NavLink>
          <NavLink to="/my-bookings" className={navLinkClassName}>My bookings</NavLink>
          {user.role === 'ADMIN' && (
            <>
              <NavLink to="/admin/utilisation" className={navLinkClassName}>Utilisation</NavLink>
              <NavLink to="/admin/rooms" className={navLinkClassName}>Manage rooms</NavLink>
            </>
          )}
          <span className="navbar-user">{user.email}</span>
          <ThemeToggle />
          <button type="button" onClick={handleLogout}>
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
