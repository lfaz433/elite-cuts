import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { BarChart3, CalendarDays, ClipboardList, ExternalLink, House, LogOut, Megaphone, MoreHorizontal, Scissors, Settings, X } from 'lucide-react';
import type { FreelancerProfileInput } from '../../../lib/marketplace/freelancerRecords';
import type { FreelancerWorkspaceView } from './freelancerWorkspaceRoutes';

const navigation = [
  { view: 'overview', label: 'Accueil', icon: House },
  { view: 'calendar', label: 'Planning', icon: CalendarDays },
  { view: 'bookings', label: 'Réservations', icon: ClipboardList },
  { view: 'services', label: 'Services & tarifs', icon: Scissors },
  { view: 'marketing', label: 'Ma vitrine', icon: Megaphone },
  { view: 'analytics', label: 'Statistiques', icon: BarChart3 },
  { view: 'settings', label: 'Paramètres', icon: Settings },
] as const;

const navigationGroups = [
  { label: 'Gérer mon activité', items: navigation.slice(0, 4) },
  { label: 'Développer mon activité', items: navigation.slice(4, 6) },
  { label: 'Compte', items: navigation.slice(6) },
] as const;

export default function FreelancerShell({ view, profile, publicUrl, onLogout, children }: {
  view: FreelancerWorkspaceView; profile: FreelancerProfileInput; publicUrl: string | null; onLogout: () => void; children: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  const identity = <><p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#D4AF37]">Barberboard · Indépendant</p><p className="mt-2 truncate text-lg font-bold">{profile.displayName || 'Votre espace'}</p><span className="mt-2 inline-flex items-center gap-2 text-xs text-white/60"><span className={`h-1.5 w-1.5 rounded-full ${publicUrl ? 'bg-emerald-400' : 'bg-white/30'}`} />{publicUrl ? 'Profil visible · sous réserve d’approbation' : 'Profil en brouillon'}</span></>;
  const link = (item: typeof navigation[number], mobile = false) => <Link key={item.view} to={`/freelancer/${item.view}`} onClick={() => setMoreOpen(false)} aria-current={view === item.view ? 'page' : undefined} className={`${mobile ? 'flex flex-col items-center justify-center gap-1 px-1 py-3 text-[11px]' : 'flex items-center gap-3 rounded-xl px-4 py-3 text-sm'} font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D4AF37] ${view === item.view ? 'bg-[#D4AF37]/10 text-[#E4C76B]' : 'text-white/55 hover:bg-white/5 hover:text-white'}`}><item.icon aria-hidden="true" className="h-5 w-5 shrink-0" />{item.label}</Link>;
  return <div className="min-h-screen bg-[#090b0c] text-[#f5f5f2]">
    <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-black focus:p-3">Aller au contenu</a>
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-[#0d1011] px-4 py-7 lg:flex">
      <div className="px-3">{identity}</div>
      <nav aria-label="Navigation principale" className="mt-10">
        {navigationGroups.map((group, index) => <section key={group.label} aria-label={`Navigation : ${group.label}`} className={index === 0 ? '' : 'mt-6 border-t border-white/10 pt-6'}>
          <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[.18em] text-white/35">{group.label}</p>
          <div className="space-y-1">{group.items.map(item => link(item))}</div>
        </section>)}
      </nav>
      <div className="mt-auto space-y-3 border-t border-white/10 pt-5">
        {publicUrl && <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 text-sm text-white/60">Voir mon profil public<ExternalLink className="h-4 w-4" /></a>}
        <button type="button" onClick={onLogout} className="flex items-center gap-2 px-3 py-2 text-sm text-white/50"><LogOut className="h-4 w-4" /> Se déconnecter</button>
      </div>
    </aside>
    <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-[#0d1011] px-5 py-4 lg:hidden"><div className="min-w-0">{identity}</div><button type="button" onClick={onLogout} aria-label="Se déconnecter" className="rounded-xl border border-white/10 p-3 text-white/60"><LogOut className="h-4 w-4" /></button></header>
    <main id="workspace-content" className="mx-auto max-w-[1600px] px-4 py-7 pb-28 sm:px-7 lg:ml-64 lg:px-10 lg:py-10">{children}</main>
    {moreOpen && <section id="freelancer-more" aria-label="Autres onglets" onKeyDown={event => { if (event.key === 'Escape') setMoreOpen(false); }} className="fixed inset-x-3 bottom-24 z-40 rounded-2xl border border-white/15 bg-[#181c1e] p-4 shadow-2xl lg:hidden"><div className="mb-2 flex items-center justify-between"><h2 className="px-3 text-sm font-bold">Autres outils</h2><button type="button" aria-label="Fermer Plus" onClick={() => setMoreOpen(false)} className="p-2"><X className="h-4 w-4" /></button></div><div className="grid grid-cols-2 gap-2">{navigation.slice(3).map(item => link(item))}</div></section>}
    <nav aria-label="Navigation mobile" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-[#0d1011] pb-[env(safe-area-inset-bottom)] lg:hidden">{navigation.slice(0, 3).map(item => link(item, true))}<button type="button" aria-controls="freelancer-more" aria-expanded={moreOpen} onClick={() => setMoreOpen(value => !value)} className={`flex flex-col items-center justify-center gap-1 py-3 text-[11px] font-semibold ${moreOpen || navigation.slice(3).some(item => item.view === view) ? 'text-[#E4C76B]' : 'text-white/55'}`}><MoreHorizontal className="h-5 w-5" />Plus</button></nav>
  </div>;
}
