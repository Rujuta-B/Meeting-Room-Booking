// src/routes/ForbiddenPage.tsx
import { Link } from 'react-router-dom';

export function ForbiddenPage() {
  return (
    <div className="not-found-page">
      <h1>You don't have access to this page</h1>
      <p>This area is restricted to administrators.</p>
      <Link to="/">Back to search</Link>
    </div>
  );
}
