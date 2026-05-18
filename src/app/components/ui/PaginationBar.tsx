import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationBarProps {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  prev: () => void;
  next: () => void;
  goTo: (n: number) => void;
}

export function PaginationBar({ page, totalPages, from, to, total, hasPrev, hasNext, prev, next, goTo }: PaginationBarProps) {
  if (totalPages <= 1) return null;

  // Build page number list with ellipsis
  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/5">
      <span className="text-xs text-white/30 font-semibold">
        {from}–{to} sur <span className="text-white/60 font-bold">{total}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={prev}
          disabled={!hasPrev}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="w-8 h-8 flex items-center justify-center text-white/20 text-xs">…</span>
          ) : (
            <button
              key={p}
              onClick={() => goTo(p as number)}
              className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                page === p
                  ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20'
                  : 'text-white/40 hover:text-white hover:bg-white/10'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={next}
          disabled={!hasNext}
          className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
