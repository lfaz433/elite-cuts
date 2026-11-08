import { useState, type ReactNode } from 'react';
import { ArrowLeft, BarChart3, Bell, CalendarCheck, CalendarDays, LayoutDashboard, Menu, Plus, Scissors, Settings, Sparkles, Store, X } from 'lucide-react';
import { Link } from 'react-router';
import PreviewNotifications from './PreviewNotifications';
import type { PreviewNotification, PreviewView } from './freelancerPreviewModel';

export const PREVIEW_NAVIGATION: Array<{ id: PreviewView; label: string; Icon: typeof LayoutDashboard }> = [
  { id: 'today', label: "Aujourd’hui", Icon: LayoutDashboard },
  { id: 'planning', label: 'Planning', Icon: CalendarDays },
  { id: 'bookings', label: 'Réservations', Icon: CalendarCheck },
  { id: 'services', label: 'Services & tarifs', Icon: Scissors },
  { id: 'showcase', label: 'Ma vitrine', Icon: Store },
  { id: 'analytics', label: 'Statistiques', Icon: BarChart3 },
  { id: 'settings', label: 'Paramètres', Icon: Settings },
];
export const PREVIEW_MOBILE_NAVIGATION = PREVIEW_NAVIGATION.filter(item => ['today', 'planning', 'bookings'].includes(item.id));

type FreelancerPreviewShellProps = {
  activeView: PreviewView;
  notifications: PreviewNotification[];
  onNavigate: (view: PreviewView) => void;
  onMarkAllNotificationsRead: () => void;
  children: ReactNode;
};

function NavigationLinks({ activeView, onNavigate, compact = false, navigation = PREVIEW_NAVIGATION }: Pick<FreelancerPreviewShellProps, 'activeView' | 'onNavigate'> & { compact?: boolean; navigation?: typeof PREVIEW_NAVIGATION }) {
  return <>{navigation.map(({ id, label, Icon }) => <button type="button" key={id} onClick={() => onNavigate(id)} aria-current={activeView === id ? 'page' : undefined} className={`group flex items-center gap-3 rounded-xl text-sm font-bold transition ${compact ? 'min-w-0 flex-1 flex-col justify-center gap-1 px-1 py-2 text-[10px]' : 'w-full px-3 py-2.5 text-left'} ${activeView === id ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/10' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}><Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} /><span className={compact ? 'max-w-full truncate' : ''}>{label}</span></button>)}</>;
}

export default function FreelancerPreviewShell({ activeView, notifications, onNavigate, onMarkAllNotificationsRead, children }: FreelancerPreviewShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const unread = notifications.filter(notification => !notification.read).length;
  const navigate = (view: PreviewView) => { onNavigate(view); setMobileOpen(false); setNotificationsOpen(false); };
  return <div className="min-h-screen bg-[#0b0b0c] text-white" data-demo-local="true">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-white/10 bg-[#111112] px-4 py-5 lg:flex lg:flex-col">
      <div className="flex items-center gap-3 px-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#D4AF37] text-black"><Scissors className="h-5 w-5" /></span><div><p className="font-black tracking-tight">Elite Cuts</p><p className="text-[11px] font-medium text-white/45">Espace indépendant</p></div></div>
      <nav className="mt-8 space-y-1" aria-label="Navigation principale"><NavigationLinks activeView={activeView} onNavigate={navigate} /></nav>
      <div className="mt-auto rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/5 p-4"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.15em] text-[#D4AF37]"><Sparkles className="h-3.5 w-3.5" /> Mode démo</div><p className="mt-2 text-xs leading-5 text-white/55">Aucune réservation, disponibilité ou notification n’est enregistrée.</p></div>
      <Link to="/" className="mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-white/45 transition hover:bg-white/5 hover:text-white"><ArrowLeft className="h-4 w-4" /> Retour à l’accueil</Link>
    </aside>
    <div className="min-h-screen lg:pl-64">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0b0b0c]/90 backdrop-blur"><div className="flex h-16 items-center justify-between px-4 sm:px-6"><div className="flex items-center gap-3"><button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-white/70 hover:bg-white/5 lg:hidden" aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button><div><p className="text-xs font-medium text-white/45">Mardi 10 novembre</p><p className="text-sm font-black">{PREVIEW_NAVIGATION.find(item => item.id === activeView)?.label}</p></div></div><div className="relative"><button type="button" onClick={() => setNotificationsOpen(open => !open)} className="relative rounded-xl p-2 text-white/70 transition hover:bg-white/5 hover:text-white" aria-label="Ouvrir les notifications" aria-expanded={notificationsOpen}><Bell className="h-5 w-5" />{unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[#D4AF37] ring-2 ring-[#0b0b0c]" />}</button><PreviewNotifications open={notificationsOpen} notifications={notifications} onClose={() => setNotificationsOpen(false)} onOpenView={navigate} onMarkAllRead={() => { onMarkAllNotificationsRead(); setNotificationsOpen(false); }} /></div></div></header>
      <main className="mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8 lg:pb-8">{children}</main>
    </div>
    {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navigation"><button type="button" aria-label="Fermer le menu" className="absolute inset-0 bg-black/65" onClick={() => setMobileOpen(false)} /><section className="relative h-full w-[min(18rem,85vw)] border-r border-white/10 bg-[#111112] p-4 shadow-2xl"><header className="flex items-center justify-between px-2 py-1"><span className="font-black">Elite Cuts</span><button type="button" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-white/60 hover:bg-white/5"><X className="h-5 w-5" /></button></header><nav className="mt-7 space-y-1" aria-label="Navigation mobile complète"><NavigationLinks activeView={activeView} onNavigate={navigate} /></nav></section></div>}
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-white/10 bg-[#151515]/95 px-2 pb-[max(.5rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden" aria-label="Navigation mobile"><NavigationLinks activeView={activeView} onNavigate={navigate} navigation={PREVIEW_MOBILE_NAVIGATION} compact /><button type="button" onClick={() => setMobileOpen(true)} className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold text-white/60 transition hover:bg-white/5 hover:text-white"><Plus className="h-4 w-4" /><span>Plus</span></button></nav>
  </div>;
}
