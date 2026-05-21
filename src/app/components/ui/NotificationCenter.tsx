import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, X, Calendar as CalendarIcon } from 'lucide-react';
import { useNotifications, AppNotification } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router';

export default function NotificationCenter() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, permissionStatus, requestPermission } = useNotifications();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const prevUnreadCount = useRef(unreadCount);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (unreadCount > prevUnreadCount.current) {
      setIsNew(true);
      const timer = setTimeout(() => setIsNew(false), 1500);
      prevUnreadCount.current = unreadCount;
      return () => clearTimeout(timer);
    }
    prevUnreadCount.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notif: AppNotification) => {
    if (!notif.read) {
      await markAsRead(notif.id);
    }
    
    setIsOpen(false);

    // Deep Linking: navigate to the correct page based on the user's role
    if (user) {
      if (user.role === 'admin') {
        navigate(`/admin/bookings?highlight=${notif.reservationId}`);
      } else if (user.role === 'barber') {
        navigate(`/barber/reservations?highlight=${notif.reservationId}`);
      } else if (user.role === 'client') {
        navigate(`/client?highlight=${notif.reservationId}`);
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'NEW_RESERVATION':
        return <div className="w-8 h-8 rounded-full bg-[#D4AF37]/20 flex items-center justify-center text-[#D4AF37]"><CalendarIcon className="w-4 h-4" /></div>;
      case 'APPROVED':
        return <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400"><Check className="w-4 h-4" /></div>;
      case 'REJECTED':
        return <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400"><X className="w-4 h-4" /></div>;
      default:
        return <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400"><Bell className="w-4 h-4" /></div>;
    }
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - ts;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours < 1) {
      const mins = Math.floor(diff / (1000 * 60));
      return `Il y a ${mins} min`;
    }
    if (hours < 24) return `Il y a ${hours}h`;
    return d.toLocaleDateString('fr-FR');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button 
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2.5 rounded-full bg-white/5 hover:bg-white/10 transition-all relative border ${isNew ? 'border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.5)]' : 'border-white/10'}`}
        animate={isNew ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.3, repeat: 3 }}
      >
        <Bell className={`w-5 h-5 ${isNew ? 'text-[#D4AF37]' : 'text-white/80'}`} />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[9px] font-black animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed sm:absolute top-[70px] sm:top-full left-4 right-4 sm:left-auto sm:right-0 sm:mt-4 w-auto sm:w-[400px] bg-[#1a1a1a]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.7)] overflow-hidden z-[100] origin-top sm:origin-top-right"
          >
            <div className="p-4 border-b border-white/5 flex flex-col gap-3 bg-white/5">
              <div className="flex justify-between items-center">
                <h3 className="font-black text-lg">Notifications</h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={markAllAsRead}
                    className="text-xs text-[#D4AF37] font-bold hover:underline"
                  >
                    Tout marquer comme lu
                  </button>
                )}
              </div>
              {permissionStatus !== 'granted' && (
                <button 
                  onClick={async () => {
                    const granted = await requestPermission();
                    if (granted) {
                      localStorage.removeItem('skip_notifications_prompt');
                    }
                  }}
                  className="w-full py-2 bg-[#D4AF37]/10 text-[#D4AF37] text-xs font-black uppercase rounded-lg border border-[#D4AF37]/20 hover:bg-[#D4AF37] hover:text-black transition-colors"
                >
                  🔔 Activer les Alertes Push
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-white/40 flex flex-col items-center gap-3">
                  <Bell className="w-8 h-8 opacity-20" />
                  <p className="text-sm font-medium">Aucune notification pour le moment.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-4 flex gap-4 cursor-pointer hover:bg-white/5 transition-colors ${!notif.read ? 'bg-[#D4AF37]/5' : ''}`}
                    >
                      <div className="shrink-0 pt-1">
                        {getIcon(notif.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className={`text-sm truncate ${!notif.read ? 'font-black text-white' : 'font-medium text-white/80'}`}>
                            {notif.title}
                          </p>
                          <span className="text-[10px] text-white/40 shrink-0 whitespace-nowrap">
                            {formatTime(notif.createdAt)}
                          </span>
                        </div>
                        <p className={`text-xs mt-1 line-clamp-2 ${!notif.read ? 'text-white/80' : 'text-white/50'}`}>
                          {notif.message}
                        </p>
                      </div>
                      {!notif.read && (
                        <div className="shrink-0 flex items-center">
                          <div className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
