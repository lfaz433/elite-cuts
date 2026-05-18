import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, X } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { toast } from 'sonner';

export default function NotificationPermissionModal() {
  const { permissionStatus, requestPermission } = useNotifications();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show if not granted and not explicitly denied (so 'default')
    // We also use localStorage to avoid spamming the user if they clicked 'Plus tard'
    const hasSkipped = localStorage.getItem('skip_notifications_prompt');
    
    if (permissionStatus === 'default' && !hasSkipped) {
      // Delay showing the modal so it doesn't interrupt immediate login flow
      const timer = setTimeout(() => setIsVisible(true), 3000);
      return () => clearTimeout(timer);
    }
  }, [permissionStatus]);

  const handleAllow = async () => {
    const granted = await requestPermission();
    if (granted) {
      toast.success('Notifications activées avec succès 🔔');
    } else {
      toast.error('Les notifications sont bloquées. Veuillez les autoriser dans les paramètres de votre navigateur.');
    }
    setIsVisible(false);
  };

  const handleLater = () => {
    localStorage.setItem('skip_notifications_prompt', 'true');
    setIsVisible(false);
  };

  if (permissionStatus === 'granted' || permissionStatus === 'denied') return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="bg-[#141414] border border-white/10 rounded-[2rem] p-8 max-w-md w-full shadow-2xl relative overflow-hidden"
          >
            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#D4AF37]/20 rounded-full blur-3xl pointer-events-none" />

            <button 
              onClick={handleLater}
              className="absolute top-4 right-4 p-2 text-white/40 hover:text-white bg-white/5 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center text-center gap-6">
              <div className="w-20 h-20 bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/5 rounded-full flex items-center justify-center border border-[#D4AF37]/20 animate-pulse">
                <Bell className="w-10 h-10 text-[#D4AF37]" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-black uppercase tracking-tight">Activer les notifications</h2>
                <p className="text-white/60 text-sm leading-relaxed">
                  Recevez instantanément les nouvelles réservations et alertes importantes. Ne manquez plus aucun client.
                </p>
              </div>

              <div className="flex flex-col w-full gap-3 mt-2">
                <button
                  onClick={handleAllow}
                  className="w-full py-4 bg-[#D4AF37] text-black font-black uppercase tracking-wider rounded-xl hover:scale-[1.02] transition-all shadow-lg shadow-[#D4AF37]/20"
                >
                  Autoriser
                </button>
                <button
                  onClick={handleLater}
                  className="w-full py-4 bg-white/5 text-white/60 font-bold uppercase tracking-wider rounded-xl hover:bg-white/10 transition-all"
                >
                  Plus tard
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
