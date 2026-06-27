import { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, Star, LogOut, History, CreditCard, Scissors, Percent, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router';
import BookingModal from '../modals/BookingModal';
import NotificationCenter from '../ui/NotificationCenter';
import NotificationPermissionModal from '../modals/NotificationPermissionModal';
import { useEffect } from 'react';

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const tenant = useTenant();
  const { bookings, services, barbers, campaigns, loading } = useBusiness();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookings');
  const [bookingOpen, setBookingOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };

  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());

  // Deep linking logic for highlighting and scrolling to reservations
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get('highlight');
    if (highlightId) {
      setActiveTab('bookings');
      setHighlightedIds(prev => new Set(prev).add(highlightId));
      
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      
      // Scroll to element after render
      setTimeout(() => {
        const el = document.getElementById(`booking-${highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
      
      // Remove highlight after 5 seconds
      setTimeout(() => {
        setHighlightedIds(prev => {
          const next = new Set(prev);
          next.delete(highlightId);
          return next;
        });
      }, 5000);
    }
  }, []);

  // Filter bookings securely by clientId if present, otherwise fallback to clientName matching for legacy reservations
  // Memoize filtered lists
  const myBookings = useMemo(() => 
    bookings.filter(b => {
      if (b.clientId && user?.uid) {
        return b.clientId === user.uid;
      }
      return b.clientName?.toLowerCase() === user?.name?.toLowerCase();
    }),
    [bookings, user?.name, user?.uid]
  );

  const upcoming = useMemo(() => 
    myBookings.filter(b => b.status === 'pending' || b.status === 'approved'),
    [myBookings]
  );

  const past = useMemo(() => 
    myBookings.filter(b => b.status === 'completed'),
    [myBookings]
  );

  const clientSegment = useMemo(() => {
    const totalVisits = myBookings.length;
    const lastVisit = myBookings
      .filter(b => b.status === 'completed')
      .reduce((latest, b) => !latest || b.date > latest ? b.date : latest, null as string | null);
    
    const daysSinceLastVisit = lastVisit 
      ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    const createdDaysAgo = user?.createdAt 
      ? Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999;

    if (totalVisits > 5) return 'vip';
    if (daysSinceLastVisit > 30 && lastVisit !== null) return 'inactive';
    if (createdDaysAgo <= 14) return 'new';
    return 'active';
  }, [myBookings, user]);

  const myCampaigns = useMemo(() => {
    return (campaigns || []).filter(camp => {
      if (camp.status === 'inactive') return false;
      return camp.segment === 'all' || camp.segment === clientSegment;
    });
  }, [campaigns, clientSegment]);

  const getBarberName = (barberId: string) => barbers.find(b => b.id === barberId)?.name || 'Coiffeur';
  const getServiceName = (serviceId: string) => services.find(s => s.id === serviceId)?.name || 'Service';
  const getServicePrice = (serviceId: string) => services.find(s => s.id === serviceId)?.price || '—';

  const statusLabels: Record<string, string> = {
    pending: 'En attente',
    approved: 'Confirmé',
    completed: 'Terminé',
    rejected: 'Annulé',
  };
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    approved: 'bg-green-500/20 text-green-400',
    completed: 'bg-blue-500/20 text-blue-400',
    rejected: 'bg-red-500/20 text-red-400',
  };

  return (
    <div className="min-h-screen bg-black">
      <NotificationPermissionModal />

      {/* Navbar */}
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-6 h-6 text-[#D4AF37]" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Barberboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-medium">{user?.name}</p>
              <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">
                {user?.role === 'admin' ? 'Administrateur' : user?.role === 'barber' ? 'Coiffeur' : 'Client'}
              </p>
            </div>
            <NotificationCenter />
            <button onClick={handleLogout} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-8 bg-white/5 p-1 rounded-xl">
          {[
            { id: 'bookings', icon: Calendar, label: 'Réservations' },
            { id: 'history', icon: History, label: 'Historique' },
            { id: 'promotions', icon: Percent, label: 'Promotions' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black shadow'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Upcoming Bookings */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-white">Mes Rendez-vous</h2>
              <button
                onClick={() => setBookingOpen(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-[#D4AF37]/30 transition-all active:scale-95"
              >
                + Réserver
              </button>
            </div>

            {loading && (
              <div className="space-y-3">
                {[1, 2].map(i => <div key={i} className="h-28 bg-white/5 rounded-2xl animate-pulse" />)}
              </div>
            )}

            {!loading && upcoming.length === 0 && (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
                <Calendar className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-4" />
                <p className="text-white/60 mb-2">Aucun rendez-vous à venir</p>
                <button onClick={() => setBookingOpen(true)} className="text-[#D4AF37] text-sm hover:underline">
                  Prendre un rendez-vous →
                </button>
              </div>
            )}

            {!loading && upcoming.map(b => (
              <motion.div id={`booking-${b.id}`} key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border p-5 ${highlightedIds.has(b.id) ? 'border-[#D4AF37] shadow-[0_0_15px_rgba(212,175,55,0.3)] bg-[#D4AF37]/5' : 'border-[#D4AF37]/20'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-white">{getServiceName(b.serviceId)}</h3>
                    <p className="text-white/50 text-sm flex items-center gap-1 mt-0.5"><User className="w-3 h-3" />{getBarberName(b.barberId)}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[b.status] || 'bg-white/10 text-white/60'}`}>
                    {statusLabels[b.status] || b.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-white/50">
                  <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />{b.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#D4AF37]" />{b.time}</span>
                  <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-[#D4AF37]" />{getServicePrice(b.serviceId)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* History */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-2">Historique</h2>

            {!loading && past.length === 0 && (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
                <History className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-4" />
                <p className="text-white/60">Aucun service terminé pour le moment.</p>
              </div>
            )}

            {past.map(b => (
              <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{getServiceName(b.serviceId)}</h3>
                    <p className="text-white/50 text-sm flex items-center gap-1 mt-0.5"><User className="w-3 h-3" />{getBarberName(b.barberId)}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-white/50 mt-2">
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-[#D4AF37]" />{b.date}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-[#D4AF37]" />{b.time}</span>
                      <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5 text-[#D4AF37]" />{b.pricePaid ? `€${b.pricePaid}` : getServicePrice(b.serviceId)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[#FFD700]">
                    {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Promotions */}
        {activeTab === 'promotions' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white mb-2">Offres & Promotions</h2>
            
            {!loading && myCampaigns.length === 0 && (
              <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10">
                <Percent className="w-12 h-12 text-[#D4AF37]/40 mx-auto mb-4" />
                <p className="text-white/60">Aucune offre promotionnelle disponible pour le moment.</p>
              </div>
            )}

            {myCampaigns.map(camp => (
              <motion.div 
                key={camp.id} 
                initial={{ opacity: 0, y: 16 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 uppercase tracking-wider">
                      Offre Spéciale
                    </span>
                    {camp.couponCode && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                        -{camp.discountAmount}%
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-bold text-white mt-3">{camp.title}</h3>
                  <p className="text-white/60 text-xs mt-2 leading-relaxed">{camp.description}</p>
                </div>

                {camp.couponCode && (
                  <div className="bg-white/5 border border-white/5 p-3.5 rounded-xl flex items-center justify-between mt-4">
                    <div>
                      <p className="text-[8px] text-white/30 font-black uppercase tracking-wider font-bold">Code promo</p>
                      <p className="text-sm font-black text-[#D4AF37] tracking-wider select-all">{camp.couponCode}</p>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(camp.couponCode || '');
                        toast.success('Code promotionnel copié !');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#D4AF37]/10 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black rounded-lg text-xs font-bold transition-all"
                      title="Copier le code"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copier
                    </button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {bookingOpen && <BookingModal onClose={() => setBookingOpen(false)} />}
    </div>
  );
}
