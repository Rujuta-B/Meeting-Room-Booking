// src/components/layout/ProtectedLayout.jsx
//
// A shared shell (nav bar + content area) rendered around every
// authenticated page via React Router's nested-route <Outlet> - keeps the
// nav bar from being repeated inside every single page component.
import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar.jsx';

export function ProtectedLayout() {
  return (
    <div className="app-shell">
      <NavBar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
