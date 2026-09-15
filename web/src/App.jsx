// src/App.jsx
//
// All routing lives here in one place, so it's easy to see the whole
// app's shape at a glance: which routes need auth, which need admin, and
// which shared layout wraps them. Plain <Routes>/<Route> (not the
// loader/action "data router" API) is enough at this route count - no
// need for the extra complexity React Router's newer data APIs bring for
// a handful of pages.
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { RequireAuth } from './auth/RequireAuth.jsx';
import { RequireAdmin } from './auth/RequireAdmin.jsx';
import { ProtectedLayout } from './components/layout/ProtectedLayout.jsx';
import { LoginPage } from './routes/LoginPage.jsx';
import { RegisterPage } from './routes/RegisterPage.jsx';
import { RoomSearchPage } from './routes/RoomSearchPage.jsx';
import { BookingFormPage } from './routes/BookingFormPage.jsx';
import { RecurringBookingFormPage } from './routes/RecurringBookingFormPage.jsx';
import { MyBookingsPage } from './routes/MyBookingsPage.jsx';
import { AdminUtilisationPage } from './routes/AdminUtilisationPage.jsx';
import { AdminRoomsPage } from './routes/AdminRoomsPage.jsx';
import { NotFoundPage } from './routes/NotFoundPage.jsx';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Every route below requires a real, authenticated session -
            RequireAuth wraps the shared nav/layout shell once, rather than
            each page needing its own guard. */}
        <Route
          element={
            <RequireAuth>
              <ProtectedLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<RoomSearchPage />} />
          <Route path="/book" element={<BookingFormPage />} />
          <Route path="/bookings/new-series" element={<RecurringBookingFormPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />

          {/* Admin-only routes nest an EXTRA RequireAdmin check on top of
              the RequireAuth already applied by the parent route above -
              see auth/RequireAdmin.jsx for why this is UX-only, not real
              enforcement. */}
          <Route path="/admin/utilisation" element={<RequireAdmin><AdminUtilisationPage /></RequireAdmin>} />
          <Route path="/admin/rooms" element={<RequireAdmin><AdminRoomsPage /></RequireAdmin>} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AuthProvider>
  );
}
