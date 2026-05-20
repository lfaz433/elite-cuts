import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  DollarSign,
  Calendar,
  Scissors,
  TrendingUp,
  Clock,
  Plus,
  LogOut,
  User,
  BarChart3,
  Wallet,
  CheckCircle,
  X,
  Phone,
  Mail,
  FileText,
  ShoppingBag,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { Html5Qrcode } from 'html5-qrcode';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import NotificationCenter from '../ui/NotificationCenter';
import NotificationPermissionModal from '../modals/NotificationPermissionModal';
// Lazy load heavy components
const ScannerModal = lazy(() => import('../modals/ScannerModal'));
const SettlementModal = lazy(() => import('../modals/SettlementModal'));
const ManualBookingModal = lazy(() => import('../modals/ManualBookingModal'));
const SaleModal = lazy(() => import('../modals/SaleModal').then(m => ({ default: m.SaleModal })));
const POSSaleModal = lazy(() => import('../modals/POSSaleModal').then(m => ({ default: m.POSSaleModal })));
const BarberAnalytics = lazy(() => import('../admin/BarberAnalytics').then(m => ({ default: m.BarberAnalytics })));
const AddServiceModal = lazy(() => import('../modals/AddServiceModal'));

// --- Sub-components ---

const WalkInModal = ({ onClose, services, currentBarber, commissionRate, addBooking }: any) => {
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [tipAmount, setTipAmount] = useState('0');
  const [pricePaid, setPricePaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isSuccess, setIsSuccess] = useState(false);

  const selectedService = services.find((s: any) => s.id === selectedServiceId);
  
  useEffect(() => {
    if (selectedService) {
      setPricePaid((selectedService.price || '').replace(/[^0-9]/g, ''));
    }
  }, [selectedService]);
  const price = selectedService ? parseInt((selectedService.price || '').replace(/[^0-9]/g, '')) : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId) return;

    // Create a completed booking automatically
    const newBooking = {
      id: Date.now().toString(),
      clientId: 'walk-in',
      clientName: 'Client sans RDV',
      clientPhone: 'N/A',
      serviceId: selectedServiceId,
      barberId: currentBarber.id,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      status: 'completed',
      pricePaid: parseFloat(pricePaid) || 0,
      tip: parseFloat(tipAmount) || 0,
      paymentMethod
    };
    
    try {
      addBooking(newBooking);
      toast.custom((t) => (
        <div className="bg-[#141414] border border-green-500/50 p-6 rounded-2xl flex flex-col items-center justify-center gap-4 shadow-2xl w-full min-w-[300px]">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
            <CheckCircle className="w-10 h-10 text-green-500" />
          </div>
          <h3 className="text-xl font-bold text-white">Action réussie !</h3>
        </div>
      ), { duration: 1500, position: 'top-center' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error: any) {
      alert("ERREUR: " + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/30 p-8"
      >
        <h3 className="text-2xl font-bold text-white mb-6">Nouveau Service (Sans RDV)</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white mb-2 text-sm">Sélectionner un service</label>
            <select
              value={selectedServiceId}
              onChange={(e) => setSelectedServiceId(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
              required
            >
              <option value="">Choisir un service</option>
              {services.map((service: any) => (
                <option key={service.id} value={service.id}>
                  {service.name} - {service.price}
                </option>
              ))}
            </select>
          </div>

          {selectedServiceId && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/40 text-[10px] mb-1 uppercase font-bold">Prix Payé (€)</label>
                  <input 
                    type="number" 
                    value={pricePaid} 
                    onChange={(e) => setPricePaid(e.target.value)} 
                    className="w-full bg-white/10 border border-[#D4AF37]/30 p-3 rounded-lg text-white font-bold text-lg" 
                  />
                </div>
                <div>
                  <label className="block text-white/40 text-[10px] mb-1 uppercase font-bold">Pourboire (€)</label>
                  <input 
                    type="number" 
                    value={tipAmount} 
                    onChange={(e) => setTipAmount(e.target.value)} 
                    className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white font-bold text-lg" 
                  />
                </div>
              </div>

              <div className="p-4 bg-white/5 rounded-lg border border-[#D4AF37]/20">
                <p className="text-white/60 text-sm mb-2 font-bold">Récapitulatif des gains</p>
                <div className="space-y-1 text-white text-sm">
                  <div className="flex justify-between">
                    <span>Montant total:</span>
                    <span className="text-[#D4AF37] font-bold">€{parseFloat(pricePaid) || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Votre part ({commissionRate}%):</span>
                    <span className="text-green-400 font-bold">€{((parseFloat(pricePaid) || 0) * commissionRate) / 100}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Part du salon:</span>
                    <span className="text-white/40 italic">€{((parseFloat(pricePaid) || 0) * (100 - commissionRate)) / 100}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          <label className="block text-white/40 text-sm mt-4 mb-2">Méthode de paiement</label>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button type="button" onClick={() => setPaymentMethod('cash')} className={`py-2 rounded-lg text-sm font-bold border ${paymentMethod === 'cash' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-transparent text-white/60 border-white/20'}`}>Espèce</button>
            <button type="button" onClick={() => setPaymentMethod('card')} className={`py-2 rounded-lg text-sm font-bold border ${paymentMethod === 'card' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-transparent text-white/60 border-white/20'}`}>Carte Bancaire</button>
          </div>



          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors font-bold"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold"
            >
              Encaisser
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

// --- Main Component ---

export default function BarberDashboard() {
  const { user, logout } = useAuth();
  const { bookings, addBooking, services, barbers, updateBarber, updateBooking, updateBookingStatus, products, addSale, addAttendance, attendance, businessInfo, addSettlement, settlements, updateBarberStatus } = useBusiness();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState(() => {
    const path = window.location.pathname;
    const subpath = path.split('/barber/')[1];
    const allowed = ['dashboard', 'reservations', 'boutique', 'horaires'];
    return (subpath && allowed.includes(subpath)) ? subpath : 'dashboard';
  });

  // Update URL subpath when activeTab changes
  useEffect(() => {
    if (activeTab === 'dashboard') {
      navigate('/barber', { replace: true });
    } else {
      navigate(`/barber/${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate]);

  // Deep linking logic for highlighting and scrolling to reservations
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get('highlight');
    if (highlightId) {
      setActiveTab('reservations');
      setResSubTab('today'); // Start with today or let it switch based on date, but today is safest. Actually, better check the booking date if we wanted, but 'all' isn't an option for Barber. Let's just switch to tab.
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

  const [resSubTab, setResSubTab] = useState<'today' | 'upcoming' | 'history'>('today');
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [posProduct, setPosProduct] = useState<any>(null);
  const [isManualBookingOpen, setIsManualBookingOpen] = useState(false);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [bookingToReject, setBookingToReject] = useState<string | null>(null);

  // Strictly match barber using the barberId from the authenticated profile
  const currentBarber = barbers.find(b => b.id === user?.barberId) || barbers.find(b => b.email === user?.email);

  const today = new Date().toISOString().split('T')[0];

  const myBookings = bookings.filter(b => b.barberId === currentBarber?.id);
  const todayCompleted = myBookings.filter(b => b.status === 'completed' && b.date === today);
  
  useEffect(() => {
    if (activeTab === 'reservations') {
      const unreadBookings = myBookings.filter(b => b.unreadBarber);
      if (unreadBookings.length > 0) {
        setHighlightedIds(prev => {
          const newSet = new Set(prev);
          unreadBookings.forEach(b => newSet.add(b.id));
          return newSet;
        });
        unreadBookings.forEach(b => {
          updateBooking(b.id, { unreadBarber: false });
        });
      }
    }
  }, [activeTab, myBookings, updateBooking]);

  const sortBookings = (bookingsToSort: any[]) => {
    return [...bookingsToSort].sort((a, b) => {
      // 1. Active (pending or approved)
      const aIsActive = a.status === 'pending' || a.status === 'approved';
      const bIsActive = b.status === 'pending' || b.status === 'approved';
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      // 2. New (highlighted or unread)
      const aIsNew = a.unreadBarber || highlightedIds.has(a.id);
      const bIsNew = b.unreadBarber || highlightedIds.has(b.id);
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      // Default: sort by date/time
      return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
    });
  };

  const todayBookings = useMemo(() => {
    return sortBookings(myBookings.filter(b => b.date === today && b.status !== 'rejected'));
  }, [myBookings, today, highlightedIds]);

  const upcomingBookings = useMemo(() => {
    return sortBookings(myBookings.filter(b => b.date > today && b.status !== 'rejected'));
  }, [myBookings, today, highlightedIds]);

  const historyBookings = useMemo(() => {
    return myBookings.filter(b => b.date < today || b.status === 'rejected' || b.status === 'completed').sort((a, b) => {
      return `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`);
    });
  }, [myBookings, today]);
  
  const commissionRate = currentBarber?.commission || 50;
  
  // Memoize heavy calculations
  const stats = useMemo(() => {
    const getPeriodEarnings = (daysAgoStart: number, daysAgoEnd: number) => {
      const start = new Date(); start.setDate(start.getDate() - daysAgoStart);
      const end = new Date(); end.setDate(end.getDate() - daysAgoEnd);
      const sDate = start.toISOString().split('T')[0];
      const eDate = end.toISOString().split('T')[0];
      const periodBookings = myBookings.filter(b => b.status === 'completed' && b.date >= sDate && b.date <= eDate);
      return periodBookings.reduce((sum, b) => sum + ((b.pricePaid || 0) * commissionRate / 100) + (b.tip || 0), 0);
    };

    const getPeriodServices = (daysAgoStart: number, daysAgoEnd: number) => {
      const start = new Date(); start.setDate(start.getDate() - daysAgoStart);
      const end = new Date(); end.setDate(end.getDate() - daysAgoEnd);
      const sDate = start.toISOString().split('T')[0];
      const eDate = end.toISOString().split('T')[0];
      return myBookings.filter(b => b.status === 'completed' && b.date >= sDate && b.date <= eDate).length;
    };

    const todayRevenue = todayCompleted.reduce((sum, b) => sum + (b.pricePaid || 0), 0);
    const todayTips = todayCompleted.reduce((sum, b) => sum + (b.tip || 0), 0);
    const todayBarberShare = (todayRevenue * commissionRate / 100);
    const todayTotal = todayBarberShare + todayTips;

    return {
      today: { services: todayCompleted.length, earnings: todayTotal, share: todayBarberShare, tips: todayTips },
      week: { services: getPeriodServices(7, 0), earnings: getPeriodEarnings(7, 0) },
      month: { services: getPeriodServices(30, 0), earnings: getPeriodEarnings(30, 0) },
    };
  }, [myBookings, todayCompleted, commissionRate]);

  const weeklyData = useMemo(() => {
    const getPastDays = (days: number) => {
      return Array.from({ length: days }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (days - 1 - i));
        return d.toISOString().split('T')[0];
      });
    };
    return getPastDays(7).map(date => {
      const dayBookings = myBookings.filter(b => b.status === 'completed' && b.date === date);
      const earnings = dayBookings.reduce((sum, b) => sum + ((b.pricePaid || 0) * commissionRate / 100) + (b.tip || 0), 0);
      const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
      return { day: dayName, services: dayBookings.length, earnings };
    });
  }, [myBookings, commissionRate]);

  const monthlyData = useMemo(() => {
    const getPeriodEarnings = (daysAgoStart: number, daysAgoEnd: number) => {
      const start = new Date(); start.setDate(start.getDate() - daysAgoStart);
      const end = new Date(); end.setDate(end.getDate() - daysAgoEnd);
      const sDate = start.toISOString().split('T')[0];
      const eDate = end.toISOString().split('T')[0];
      const periodBookings = myBookings.filter(b => b.status === 'completed' && b.date >= sDate && b.date <= eDate);
      return periodBookings.reduce((sum, b) => sum + ((b.pricePaid || 0) * commissionRate / 100) + (b.tip || 0), 0);
    };
    return [
      { week: 'Sem-3', earnings: getPeriodEarnings(28, 21) },
      { week: 'Sem-2', earnings: getPeriodEarnings(21, 14) },
      { week: 'Sem-1', earnings: getPeriodEarnings(14, 7) },
      { week: 'Actuelle', earnings: getPeriodEarnings(7, 0) },
    ];
  }, [myBookings, commissionRate]);

  const recentServicesList = todayCompleted.map((b, idx) => {
    const s = services.find(serv => serv.id === b.serviceId);
    return {
      id: b.id || idx,
      client: b.clientName,
      service: s?.name || 'Service',
      price: b.pricePaid,
      time: b.time,
      tip: b.tip || 0,
      barberShare: ((b.pricePaid || 0) * commissionRate / 100)
    };
  });

  const upcomingAppointmentsList = myBookings
    .filter(b => (b.status === 'approved' || b.status === 'pending') && b.date >= today)
    .sort((a, b) => {
      const aTime = new Date(`${a.date}T${a.time}`);
      const bTime = new Date(`${b.date}T${b.time}`);
      return aTime.getTime() - bTime.getTime();
    })
    .slice(0, 5)
    .map((b, idx) => {
      const s = services.find(serv => serv.id === b.serviceId);
      return {
        id: b.id || idx,
        client: b.clientName,
        service: s?.name || 'Service',
        time: `${b.date === today ? "Aujourd'hui" : b.date} à ${b.time}`
      };
    });

  const isCheckedInToday = (attendance || []).some(a => a.barberId === currentBarber?.id && a.date === today);

  const handleCheckInSuccess = () => {
    addAttendance({
      barberId: currentBarber.id,
      date: today,
      checkInTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
      location: businessInfo.address,
      status: 'on-time'
    });
    setCheckInModalOpen(false);
    toast.success("Pointage effectué avec succès !");
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  if (!user) return null;

  if (!currentBarber && user?.role === 'barber') {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-center">
        <Scissors className="w-12 h-12 text-[#D4AF37] mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-white mb-2">Profil non lié</h2>
        <p className="text-white/60 text-sm max-w-xs">Votre compte n'est pas encore lié à un profil de coiffeur. Veuillez contacter l'administrateur.</p>
        <button onClick={logout} className="mt-6 px-6 py-2 bg-white/10 text-white rounded-lg">Déconnexion</button>
      </div>
    );
  }

  const hasUnreadBookings = myBookings.some(b => b.unreadBarber);

  return (
    <div className="min-h-screen bg-black pb-24">
      <NotificationPermissionModal />
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
              Elite Cuts
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-white text-sm font-bold">{user?.name}</p>
              <select value={currentBarber?.status} onChange={(e) => updateBarberStatus(currentBarber.id, e.target.value as any)} className="bg-transparent text-[10px] text-white/40 focus:outline-none text-right">
                <option value="available">Disponible</option>
                <option value="busy">Occupé</option>
                <option value="break">En Pause</option>
              </select>
            </div>
            {!isCheckedInToday && <button onClick={() => setCheckInModalOpen(true)} className="p-2 bg-[#D4AF37]/10 text-[#D4AF37] rounded-lg text-xs font-bold border border-[#D4AF37]/20">Pointage</button>}
            <NotificationCenter />
            <button onClick={() => setSettlementModalOpen(true)} className="p-2 bg-white/5 text-white/60 rounded-lg hover:bg-white/10"><Wallet className="w-4 h-4" /></button>
            <button onClick={handleLogout} className="p-2 hover:bg-red-500/10 rounded-lg transition-colors text-white/60 hover:text-red-500">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </nav>

      <div className="p-4 max-w-7xl mx-auto">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">Gains & Stats</h2>
                <p className="text-white/40 text-sm">Suivez vos performances</p>
              </div>
              <button
                onClick={() => setAddServiceOpen(true)}
                className="px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg shadow-lg shadow-[#D4AF37]/20 hover:scale-105 transition-all flex items-center gap-2 font-bold text-sm"
              >
                <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Nouveau Service</span>
              </button>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600"><DollarSign className="w-5 h-5 text-white" /></div>
                  <span className="text-white/60 text-xs">Aujourd'hui</span>
                </div>
                <p className="text-3xl font-bold text-white mb-1">€{stats.today.earnings.toFixed(2)}</p>
                <p className="text-white/60 text-xs mb-3">{stats.today.services} services terminés</p>
                <div className="pt-3 border-t border-white/10 space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Part Coiffeur:</span><span className="text-green-400 font-bold">€{stats.today.share.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-white/40">Pourboires:</span><span className="text-[#D4AF37] font-bold">€{stats.today.tips.toFixed(2)}</span>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600"><Calendar className="w-5 h-5 text-white" /></div>
                  <span className="text-white/60 text-xs">Cette Semaine</span>
                </div>
                <p className="text-3xl font-bold text-white mb-1">€{stats.week.earnings.toFixed(2)}</p>
                <p className="text-white/60 text-xs">{stats.week.services} services terminés</p>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-2 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700]"><Wallet className="w-5 h-5 text-black" /></div>
                  <span className="text-white/60 text-xs">Ce Mois</span>
                </div>
                <p className="text-3xl font-bold text-white mb-1">€{stats.month.earnings.toFixed(2)}</p>
                <p className="text-white/60 text-xs">{stats.month.services} services terminés</p>
              </motion.div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4 mb-8">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-[#D4AF37]" /> Performances sur 7 Jours
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="day" stroke="#a3a3a3" tick={{fontSize: 12}} />
                    <YAxis stroke="#a3a3a3" tick={{fontSize: 12}} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '8px' }} />
                    <Bar dataKey="earnings" fill="url(#goldGradient)" />
                    <defs>
                      <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FFD700" />
                        <stop offset="100%" stopColor="#D4AF37" />
                      </linearGradient>
                    </defs>
                  </BarChart>
                </ResponsiveContainer>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#D4AF37]" /> Tendance Mensuelle
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                    <XAxis dataKey="week" stroke="#a3a3a3" tick={{fontSize: 12}} />
                    <YAxis stroke="#a3a3a3" tick={{fontSize: 12}} />
                    <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '8px' }} />
                    <Line type="monotone" dataKey="earnings" stroke="#D4AF37" strokeWidth={3} />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-[#D4AF37]" /> Services Récents (Aujourd'hui)
                </h3>
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                  {recentServicesList.length === 0 ? (
                    <p className="text-white/40 text-sm italic">Aucun service pour l'instant.</p>
                  ) : recentServicesList.map((service) => (
                    <div key={service.id} className="p-3 bg-white/5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/30 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-white font-bold text-sm">{service.client}</p>
                          <p className="text-white/60 text-xs">{service.service}</p>
                        </div>
                        <span className="text-white/60 text-xs">{service.time}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div><p className="text-white/40">Prix</p><p className="text-white">€{service.price}</p></div>
                        <div><p className="text-white/40">Ma Part</p><p className="text-green-400">€{service.barberShare}</p></div>
                        <div><p className="text-white/40">Pourboire</p><p className="text-[#D4AF37]">€{service.tip}</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-5">
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#D4AF37]" /> Rendez-vous à venir
                </h3>
                <div className="space-y-3">
                  {upcomingAppointmentsList.length === 0 ? (
                    <p className="text-white/40 text-sm italic">Aucun rendez-vous à venir.</p>
                  ) : upcomingAppointmentsList.map((appointment) => (
                    <div key={appointment.id} className="p-3 bg-white/5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#FFD700] flex items-center justify-center">
                            <User className="w-4 h-4 text-black" />
                          </div>
                          <div>
                            <p className="text-white font-bold text-sm">{appointment.client}</p>
                            <p className="text-white/60 text-xs">{appointment.service}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[#D4AF37] text-xs font-bold">{appointment.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-6 p-4 bg-gradient-to-r from-[#D4AF37]/10 to-[#FFD700]/10 rounded-lg border border-[#D4AF37]/20">
                  <p className="text-white/60 text-xs mb-1">Taux de commission</p>
                  <p className="text-xl font-bold text-[#D4AF37]">{commissionRate}%</p>
                  <p className="text-white/40 text-[10px] mt-1">Vous gagnez {commissionRate}% sur chaque service + 100% des pourboires.</p>
                </div>
              </motion.div>
            </div>
          </div>
        )}

        {activeTab === 'rapports' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white mb-6 uppercase tracking-wider">Mes Rapports & Analyses</h2>
            <Suspense fallback={<div className="h-40 flex items-center justify-center text-white/40">Chargement des rapports...</div>}>
              {currentBarber && (
                <BarberAnalytics 
                  bookings={bookings.filter(b => b.barberId === currentBarber.id)} 
                  barbers={[currentBarber]} 
                  services={services} 
                  attendance={attendance.filter(a => a.barberId === currentBarber.id)} 
                  isBarberView={true}
                />
              )}
            </Suspense>
          </div>
        )}

        {activeTab === 'reservations' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Agenda Coiffeur</h2>
              <button
                onClick={() => setIsManualBookingOpen(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-black text-xs hover:scale-105 transition-all shadow-lg shadow-[#D4AF37]/20 uppercase flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Ajouter un Rendez-vous
              </button>
            </div>
            
            {/* Agenda Sub-Tabs */}
            <div className="flex bg-[#141414] p-1 rounded-2xl border border-white/5 gap-1">
              {[
                { id: 'today', label: "Aujourd'hui", count: todayBookings.length },
                { id: 'upcoming', label: "À venir", count: upcomingBookings.length },
                { id: 'history', label: "Historique", count: historyBookings.length }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setResSubTab(tab.id as any)}
                  className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                    resSubTab === tab.id
                      ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/15'
                      : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                    resSubTab === tab.id ? 'bg-black/25 text-black' : 'bg-white/10 text-white/50'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* List */}
            <div className="space-y-4">
              {((resSubTab === 'today' ? todayBookings : resSubTab === 'upcoming' ? upcomingBookings : historyBookings).length === 0) ? (
                <div className="text-center py-16 bg-[#141414] rounded-2xl border border-white/5 text-white/20 italic text-sm">
                  Aucun rendez-vous dans cette catégorie.
                </div>
              ) : (
                (resSubTab === 'today' ? todayBookings : resSubTab === 'upcoming' ? upcomingBookings : historyBookings).map(b => (
                  <div id={`booking-${b.id}`} key={b.id} className={`bg-[#141414] p-6 rounded-2xl border border-[#D4AF37]/20 flex flex-col gap-4 hover:border-[#D4AF37]/45 transition-all relative overflow-hidden group ${highlightedIds.has(b.id) ? 'ring-2 ring-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.2)] bg-[#D4AF37]/5' : ''}`}>
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#D4AF37]/5 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-150 transition-all duration-300" />
                    
                    {/* Top Row: Client Name, Avatar, Time & Status */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-3 items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#D4AF37] to-[#FFD700] rounded-xl flex items-center justify-center font-bold text-black text-base shrink-0 animate-pulse">
                          {b.clientName ? b.clientName[0].toUpperCase() : 'C'}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base leading-tight flex items-center gap-2">
                            {b.clientName}
                            {(b.unreadBarber || highlightedIds.has(b.id)) && (
                              <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black uppercase rounded-lg shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse">Nouveau</span>
                            )}
                          </h4>
                          <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-widest mt-0.5">
                            {services.find(s => s.id === b.serviceId)?.name || 'Service Coiffure'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-bold text-sm flex items-center gap-1 uppercase">
                          <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> {b.time}
                        </p>
                        <p className="text-[10px] text-white/40 font-semibold uppercase mt-0.5">{b.date}</p>
                      </div>
                    </div>

                    {/* Details Panel: Contacts, Price & Barber */}
                    <div className="grid grid-cols-2 gap-4 py-3 border-y border-white/5 text-xs">
                      <div className="space-y-1">
                        <p className="text-[10px] text-white/35 font-bold uppercase tracking-wider">Contact Client</p>
                        {b.clientEmail && (
                          <a href={`mailto:${b.clientEmail}`} className="text-white/60 hover:text-[#D4AF37] truncate font-medium lowercase block transition-colors">
                            {b.clientEmail}
                          </a>
                        )}
                        {b.clientPhone && (
                          <a href={`tel:${b.clientPhone}`} className="text-white/60 hover:text-[#D4AF37] font-semibold block transition-colors">
                            {b.clientPhone}
                          </a>
                        )}
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-[10px] text-white/35 font-bold uppercase tracking-wider">Détails Service</p>
                        <p className="text-white/70 font-semibold">
                          {services.find(s => s.id === b.serviceId)?.price || '€20'} • {services.find(s => s.id === b.serviceId)?.duration || '30 min'}
                        </p>
                        <div className="flex items-center justify-end gap-1.5 flex-wrap mt-1">
                          {b.paymentStatus === 'paid' ? (
                            <span className="px-2 py-0.5 rounded-lg bg-green-500/10 text-green-400 border border-green-500/20 text-[9px] font-black uppercase">Payé</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black uppercase">Non Payé</span>
                          )}
                          {b.type === 'sans-rdv' && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[9px] font-black uppercase">Walk-in</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Notes section */}
                    {b.notes && (
                      <div className="px-3 py-2 bg-white/[0.02] border border-white/5 rounded-xl flex items-start gap-2">
                        <FileText className="w-3.5 h-3.5 text-[#D4AF37] mt-0.5 shrink-0" />
                        <p className="text-white/50 text-xs italic">{b.notes}</p>
                      </div>
                    )}

                    {/* Actions & Status row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                      <div className="flex items-center justify-between sm:justify-start w-full sm:w-auto">
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border shrink-0 ${
                          b.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/25' :
                          b.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' :
                          b.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border-blue-500/25' : 'bg-red-500/10 text-red-400 border-red-500/25'
                        }`}>
                          {b.status === 'pending' ? 'En Attente' : b.status === 'approved' ? 'Approuvé' : b.status === 'completed' ? 'Terminé' : 'Rejeté'}
                        </span>
                      </div>

                      {b.status !== 'completed' && b.status !== 'rejected' && (
                        <div className="flex flex-wrap gap-2 justify-end w-full sm:w-auto">
                          {b.clientPhone && b.clientPhone !== 'N/A' && (
                            <a 
                              href={`tel:${b.clientPhone}`} 
                              className="w-9 h-9 sm:w-10 sm:h-10 bg-white/5 text-white/80 rounded-xl flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors shrink-0"
                              title="Appeler le client"
                            >
                              <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </a>
                          )}
                          {b.status === 'pending' && (
                            <button 
                              onClick={() => { 
                                updateBookingStatus(b.id, 'approved', 'barber'); 
                                toast.success('Rendez-vous approuvé !'); 
                              }} 
                              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded-xl text-[10px] sm:text-xs font-black uppercase border border-green-500/20 transition-all text-center"
                            >
                              Approuver
                            </button>
                          )}
                          {b.status === 'approved' && (
                            <button 
                              onClick={() => setActiveBookingId(b.id)} 
                              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black hover:scale-105 rounded-xl text-[10px] sm:text-xs font-black uppercase transition-all shadow-md shadow-[#D4AF37]/10 text-center"
                            >
                              Terminer
                            </button>
                          )}
                          {(b.status === 'pending' || b.status === 'approved') && (
                            <button 
                              onClick={() => setBookingToReject(b.id)} 
                              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white rounded-xl text-[10px] sm:text-xs font-black uppercase border border-red-500/20 transition-all text-center"
                            >
                              Rejeter
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'boutique' && (
          <motion.div key="boutique" className="space-y-8">
            <h2 className="text-3xl font-black uppercase">Vente de Produits</h2>

            {/* Low stock banner */}
            {products.filter(p => p.trackStock !== false && (p.stock ?? 0) <= (p.lowStockThreshold ?? 3)).length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-2xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
                <p className="text-amber-400 text-sm font-bold">
                  {products.filter(p => p.trackStock !== false && (p.stock ?? 0) <= (p.lowStockThreshold ?? 3)).length} produit(s) en stock faible ou épuisé
                </p>
              </div>
            )}

            {/* Products grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {products.map(product => {
                const isOut = (product.stock ?? 1) === 0;
                const isLow = !isOut && (product.stock ?? 99) <= (product.lowStockThreshold ?? 3);
                return (
                  <div
                    key={product.id}
                    className={`relative bg-[#141414] border rounded-2xl overflow-hidden group transition-all ${
                      isOut ? 'border-red-500/20 opacity-70' : isLow ? 'border-amber-500/20' : 'border-white/5 hover:border-[#D4AF37]/30'
                    }`}
                  >
                    <div className="relative aspect-square bg-white/[0.03]">
                      <img
                        src={product.image || 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=300&h=300&fit=crop'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=300&h=300&fit=crop'; }}
                      />
                      {isOut && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="px-2 py-1 bg-red-500/90 text-white text-[9px] font-black uppercase rounded-lg">Épuisé</span>
                        </div>
                      )}
                      {isLow && !isOut && (
                        <span className="absolute top-2 left-2 px-2 py-1 bg-amber-500/90 text-white text-[9px] font-black uppercase rounded-lg">{product.stock} restant{(product.stock ?? 0) > 1 ? 's' : ''}</span>
                      )}
                      {product.promoPrice && (
                        <span className="absolute top-2 right-2 px-2 py-1 bg-[#D4AF37] text-black text-[9px] font-black uppercase rounded-lg">PROMO</span>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      {product.category && <p className="text-[9px] text-white/30 font-black uppercase tracking-wider">{product.category}</p>}
                      <p className="text-white font-bold text-sm truncate">{product.name}</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[#D4AF37] font-black text-sm">€{(product.promoPrice ?? product.sellPrice).toFixed(2)}</span>
                          {product.promoPrice && <span className="text-white/25 line-through text-xs ml-1">€{product.sellPrice.toFixed(2)}</span>}
                        </div>
                        <span className="text-white/25 text-[10px]">Stock: {product.stock ?? '∞'}</span>
                      </div>
                      <div className="flex gap-1.5 pt-1">
                        <button
                          onClick={() => setPosProduct(product)}
                          disabled={isOut}
                          className="flex-1 py-2 bg-[#D4AF37]/10 text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black border border-[#D4AF37]/20 rounded-xl text-[10px] font-black transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Vendre
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {activeTab === 'horaires' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white mb-4">Mes Horaires</h3>

            {/* Status Toggle */}
            <div className="bg-[#141414] p-6 rounded-xl border border-white/10 space-y-2">
              <label className="block text-white font-bold mb-1">Statut Actuel</label>
              <p className="text-white/40 text-xs mb-4">Modifiez votre disponibilité en temps réel (visible par les clients).</p>
              
              <div className="flex bg-white/5 p-1 rounded-xl w-full">
                {[
                  { id: 'available', label: 'Actif', color: 'bg-green-500 text-white shadow-[0_0_15px_rgba(34,197,94,0.3)]', icon: CheckCircle },
                  { id: 'break', label: 'En Pause', color: 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]', icon: Clock },
                  { id: 'offline', label: 'Inactif', color: 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.3)]', icon: X }
                ].map(status => {
                  const isActive = (currentBarber?.status || 'available') === status.id;
                  return (
                    <button
                      key={status.id}
                      onClick={() => {
                        updateBarberStatus(currentBarber.id, status.id as any);
                        toast.success(`Statut mis à jour: ${status.label}`);
                      }}
                      className={`flex-1 flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 py-3 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                        isActive ? status.color : 'text-white/40 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <status.icon className="w-4 h-4" /> {status.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#141414] p-6 rounded-xl border border-white/10 space-y-6">
              
              <div>
                <label className="block text-white font-bold mb-3">Jours de travail</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 1, label: 'Lun' },
                    { id: 2, label: 'Mar' },
                    { id: 3, label: 'Mer' },
                    { id: 4, label: 'Jeu' },
                    { id: 5, label: 'Ven' },
                    { id: 6, label: 'Sam' },
                    { id: 0, label: 'Dim' }
                  ].map(day => {
                    const isWorking = currentBarber?.workingDays?.includes(day.id) ?? true;
                    return (
                      <button
                        key={day.id}
                        onClick={() => {
                          const currentDays = currentBarber?.workingDays || [1,2,3,4,5,6];
                          const newDays = isWorking 
                            ? currentDays.filter((d: number) => d !== day.id)
                            : [...currentDays, day.id];
                          updateBarber(currentBarber.id, { workingDays: newDays });
                      toast.success('Horaires mis à jour !');
                        }}
                        className={`w-12 h-12 rounded-lg font-bold flex items-center justify-center transition-all ${
                          isWorking 
                            ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20' 
                            : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                <div>
                  <label className="block text-white/60 text-sm mb-2">Heure de début</label>
                  <input 
                    type="time" 
                    defaultValue={currentBarber?.shiftStart || '09:00'} 
                    onChange={(e) => {
                      updateBarber(currentBarber.id, { shiftStart: e.target.value });
                      toast.success('✅ Action completed successfully');
                    }}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 rounded-lg focus:border-[#D4AF37] focus:outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-2">Heure de fin</label>
                  <input 
                    type="time" 
                    defaultValue={currentBarber?.shiftEnd || '18:00'} 
                    onChange={(e) => {
                      updateBarber(currentBarber.id, { shiftEnd: e.target.value });
                      toast.success('✅ Action completed successfully');
                    }}
                    className="w-full bg-white/5 border border-white/10 text-white px-4 py-3 rounded-lg focus:border-[#D4AF37] focus:outline-none font-bold"
                  />
                </div>
              </div>

              <p className="text-white/40 text-xs mt-4">La modification des horaires est automatique. Les clients verront vos disponibilités en temps réel.</p>
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-white/5 flex z-40 overflow-x-auto pb-safe">
        <button onClick={() => setActiveTab('dashboard')} className={`min-w-[70px] flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><BarChart3 className="w-5 h-5" /><span className="text-[10px] font-bold">Gains</span></button>
        <button onClick={() => setActiveTab('rapports')} className={`min-w-[70px] flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'rapports' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><TrendingUp className="w-5 h-5" /><span className="text-[10px] font-bold">Rapports</span></button>
        <button onClick={() => setActiveTab('reservations')} className={`min-w-[70px] flex-1 p-3 flex flex-col items-center gap-1 relative ${activeTab === 'reservations' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><Calendar className="w-5 h-5" /><span className="text-[10px] font-bold">Agenda</span>{hasUnreadBookings && <div className="absolute top-2 right-[30%] w-2 h-2 bg-red-500 rounded-full animate-pulse" />}</button>
        <button onClick={() => setActiveTab('boutique')} className={`min-w-[70px] flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'boutique' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><ShoppingBag className="w-5 h-5" /><span className="text-[10px] font-bold">Boutique</span></button>
        <button onClick={() => setActiveTab('horaires')} className={`min-w-[70px] flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'horaires' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><Clock className="w-5 h-5" /><span className="text-[10px] font-bold">Horaires</span></button>
      </div>

      {/* Rejection Confirmation Modal */}
      <AnimatePresence>
        {bookingToReject && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#141414] border border-red-500/30 p-8 rounded-3xl max-w-md w-full relative"
            >
              <button onClick={() => setBookingToReject(null)} className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-red-500" /> Confirmer le rejet
              </h3>
              <p className="text-white/60 mb-8">
                Êtes-vous sûr de vouloir rejeter cette réservation ? Cette action est irréversible.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setBookingToReject(null)}
                  className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (bookingToReject) {
                      updateBookingStatus(bookingToReject, 'rejected', 'barber');
                      toast.success("RÉSERVATION REJETÉE AVEC SUCCÈS");
                      setBookingToReject(null);
                    }
                  }}
                  className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-colors"
                >
                  Oui, Rejeter
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"><div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div></div>}>
        {checkInModalOpen && <ScannerModal onClose={() => setCheckInModalOpen(false)} currentBarber={currentBarber} handleCheckInSuccess={handleCheckInSuccess} />}
        {settlementModalOpen && <SettlementModal onClose={() => setSettlementModalOpen(false)} todayEarnings={{total: stats.today.earnings}} currentBarber={currentBarber} addSettlement={addSettlement} />}
        {activeBookingId && <AddServiceModal bookingId={activeBookingId} onClose={() => setActiveBookingId(null)} />}
        {addServiceOpen && <WalkInModal onClose={() => setAddServiceOpen(false)} services={services} currentBarber={currentBarber} commissionRate={commissionRate} addBooking={addBooking} />}
        {saleModalOpen && <SaleModal onClose={() => setSaleModalOpen(false)} products={products} currentBarber={currentBarber} addSale={addSale} />}
        {posProduct && (
          <POSSaleModal
            product={posProduct}
            onClose={() => setPosProduct(null)}
            onSaleComplete={() => {
              setPosProduct(null);
            }}
          />
        )}
        {isManualBookingOpen && <ManualBookingModal onClose={() => setIsManualBookingOpen(false)} preSelectedBarberId={currentBarber?.id} />}
      </Suspense>
    </div>
  );
}
