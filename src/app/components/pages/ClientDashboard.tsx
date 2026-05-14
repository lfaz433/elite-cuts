import { useState } from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, Star, LogOut, History, CreditCard, Scissors } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import BookingModal from '../modals/BookingModal';

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const { bookings, services, barbers, loading } = useBusiness();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookings');
  const [bookingOpen, setBookingOpen] = useState(false);

  const handleLogout = () => { logout(); navigate('/'); };

  // Filter bookings by this client's name (since no user ID in Firestore bookings)
  const myBookings = bookings.filter(b => b.clientName?.toLowerCase() === user?.name?.toLowerCase());
  const upcoming = myBookings.filter(b => b.status === 'pending' || b.status === 'approved');
  const past = myBookings.filter(b => b.status === 'completed');

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
      {/* Navbar */}
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors className="w-6 h-6 text-[#D4AF37]" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Elite Cuts</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-medium">{user?.name}</p>
              <p className="text-white/40 text-xs">Client</p>
            </div>
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
              <motion.div key={b.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
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
      </div>

      {bookingOpen && <BookingModal onClose={() => setBookingOpen(false)} />}
    </div>
  );
}
