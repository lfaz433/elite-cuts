import { Bell, CheckCheck, ChevronRight, X } from 'lucide-react';
import type { PreviewNotification, PreviewView } from './freelancerPreviewModel';

type PreviewNotificationsProps = {
  open: boolean;
  notifications: PreviewNotification[];
  onClose: () => void;
  onOpenView: (view: PreviewView) => void;
  onMarkAllRead: () => void;
};

export default function PreviewNotifications({ open, notifications, onClose, onOpenView, onMarkAllRead }: PreviewNotificationsProps) {
  if (!open) return null;
  const unread = notifications.filter(notification => !notification.read).length;
  return <section className="absolute right-0 top-14 z-30 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#181818] shadow-2xl shadow-black/60" aria-label="Notifications">
    <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div className="flex items-center gap-2"><Bell className="h-4 w-4 text-[#D4AF37]" /><h2 className="font-bold">Notifications</h2>{unread > 0 && <span className="rounded-full bg-[#D4AF37] px-2 py-0.5 text-[10px] font-black text-black">{unread}</span>}</div>
      <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white" aria-label="Fermer les notifications"><X className="h-4 w-4" /></button>
    </header>
    <div className="max-h-80 overflow-auto p-2">
      {notifications.map(notification => <button type="button" key={notification.id} onClick={() => onOpenView(notification.view)} className="flex w-full items-start gap-3 rounded-xl p-3 text-left transition hover:bg-white/5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read ? 'bg-white/20' : 'bg-[#D4AF37]'}`} aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold">{notification.title}</span><span className="mt-1 block text-xs leading-5 text-white/55">{notification.detail}</span></span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/35" />
      </button>)}
    </div>
    <footer className="border-t border-white/10 p-2"><button type="button" onClick={onMarkAllRead} className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-[#D4AF37] transition hover:bg-[#D4AF37]/10"><CheckCheck className="h-4 w-4" /> Tout marquer comme lu</button></footer>
  </section>;
}
