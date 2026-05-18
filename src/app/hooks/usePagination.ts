import { useState, useMemo } from 'react';

export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Clamp page whenever items/pageSize change
  const safePage = Math.min(page, totalPages);

  const paginated = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  );

  const goTo = (n: number) => setPage(Math.max(1, Math.min(n, totalPages)));
  const next = () => goTo(safePage + 1);
  const prev = () => goTo(safePage - 1);
  const reset = () => setPage(1);

  return {
    page: safePage,
    totalPages,
    paginated,
    next,
    prev,
    goTo,
    reset,
    hasNext: safePage < totalPages,
    hasPrev: safePage > 1,
    from: items.length === 0 ? 0 : (safePage - 1) * pageSize + 1,
    to: Math.min(safePage * pageSize, items.length),
    total: items.length,
  };
}
