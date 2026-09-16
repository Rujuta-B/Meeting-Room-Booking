// src/routes/AdminUtilisationPage.jsx
import { useState } from 'react';
import { getUtilisationReport } from '../api/admin.js';
import { UtilisationTable } from '../components/admin/UtilisationTable.jsx';
import { ErrorBanner } from '../components/ErrorBanner.jsx';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

export function AdminUtilisationPage() {
  const [rangeStart, setRangeStart] = useState(firstOfMonth());
  const [rangeEnd, setRangeEnd] = useState(today());
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleFetch(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // WHY rangeEnd is pushed to the START OF THE DAY AFTER the one
      // picked, not midnight of the picked date itself: the backend query
      // (api's utilisation.service.ts) filters with `start_time < rangeEnd`
      // - an EXCLUSIVE upper bound, so it can correctly use a plain B-tree
      // index range scan. If we sent midnight of the "To" date as-is, any
      // booking that starts ON that date (any time after midnight) would
      // be silently excluded - an admin picking "Aug 1 to Aug 31" would
      // get a report missing all of August 31st. Advancing rangeEnd to
      // midnight of Sept 1 makes the exclusive bound behave like an
      // INCLUSIVE end date from the admin's point of view, without
      // changing how the backend's query itself works.
      const endOfSelectedDay = new Date(rangeEnd);
      endOfSelectedDay.setDate(endOfSelectedDay.getDate() + 1);

      const result = await getUtilisationReport(new Date(rangeStart).toISOString(), endOfSelectedDay.toISOString());
      setReport(result.report);
    } catch {
      setError('Could not load the utilisation report.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-utilisation-page">
      <h1>Room utilisation</h1>
      <form onSubmit={handleFetch}>
        <label>
          From
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} required />
        </label>
        <label>
          To
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} required />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Run report'}
        </button>
      </form>
      {error && <ErrorBanner message={error} />}
      {report && <UtilisationTable report={report} />}
    </div>
  );
}
