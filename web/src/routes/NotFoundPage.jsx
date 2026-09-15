// src/routes/NotFoundPage.jsx
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <h1>Page not found</h1>
      <Link to="/">Back to search</Link>
    </div>
  );
}
