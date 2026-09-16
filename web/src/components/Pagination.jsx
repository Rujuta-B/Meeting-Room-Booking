// src/components/Pagination.jsx
//
// A single reusable pager driven entirely by the backend's `pagination`
// envelope ({ page, pageSize, total, totalPages }) - it never re-derives
// page count from a results array, since a page only ever holds a SLICE
// of the total matching rows, not the whole set.
export function Pagination({ pagination, onPageChange }) {
  if (!pagination || pagination.totalPages <= 1) return null;

  const { page, totalPages, total, pageSize } = pagination;
  const firstRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(page * pageSize, total);

  return (
    <nav className="pagination" aria-label="Pagination">
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
        Previous
      </button>
      <span className="pagination-status">
        {firstRow}–{lastRow} of {total} · page {page} of {totalPages}
      </span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
        Next
      </button>
    </nav>
  );
}
