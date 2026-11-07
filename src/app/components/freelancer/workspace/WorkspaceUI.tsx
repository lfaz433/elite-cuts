import type { ReactNode } from 'react';

export const primaryButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-bold text-[#15130a] transition hover:bg-[#e5c65e] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D4AF37]';
export const secondaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/5 disabled:opacity-40';
export const panelClass = 'rounded-2xl border border-white/10 bg-[#111517] p-5 sm:p-6';
export const inputClass = 'mt-2 w-full rounded-xl border border-white/15 bg-[#090b0c] px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]';

export function ViewHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action: ReactNode }) {
  return <header className="mb-7 flex flex-wrap items-end justify-between gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[.23em] text-[#D4AF37]">{eyebrow}</p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1><p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50">{description}</p></div><div className="shrink-0">{action}</div></header>;
}
export function EmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center"><h3 className="font-semibold">{title}</h3><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/50">{children}</p></div>;
}
export function Metric({ label, value, detail }: { label: string; value: ReactNode; detail?: string }) {
  return <div className={panelClass}><p className="text-xs font-medium text-white/55">{label}</p><p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p>{detail && <p className="mt-2 text-xs text-white/40">{detail}</p>}</div>;
}
