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
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { Html5Qrcode } from 'html5-qrcode';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// Lazy load heavy components
const ScannerModal = lazy(() => import('../modals/ScannerModal'));
const SettlementModal = lazy(() => import('../modals/SettlementModal'));
const ManualBookingModal = lazy(() => import('../modals/ManualBookingModal'));
const SaleModal = lazy(() => import('../modals/SaleModal').then(m => ({ default: m.SaleModal })));

// --- Sub-components ---


const AddServiceModal = ({ bookingId, onClose, bookings, services, updateBooking }: any) => {
  const booking = bookings.find((b: any) => b.id === bookingId);
  const service = services.find((s: any) => s.id === booking?.serviceId);
  const [tip, setTip] = useState('0');
  const [pricePaid, setPricePaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (service) {
      setPricePaid((service.price || '').replace(/[^0-9]/g, ''));
    }
  }, [service]);

  if (!booking || !service) return null;
  const handleFinish = () => {
    const finalPrice = parseFloat(pricePaid) || 0;
    try {
      updateBooking(bookingId, { status: 'completed', pricePaid: finalPrice, tip: parseFloat(tip) || 0, paymentMethod });
      toast.custom((t) => (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-[#141414] border-2 border-[#D4AF37] p-8 rounded-3xl flex flex-col items-center justify-center gap-6 shadow-[0_0_50px_rgba(212,175,55,0.3)] w-full max-w-sm mx-auto"
        >
          <div className="w-20 h-20 bg-[#D4AF37]/20 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-[#D4AF37]" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black text-white mb-2">SUCCÈS</h3>
            <p className="text-white/60 text-sm font-medium">L'action a été enregistrée avec succès.</p>
          </div>
        </motion.div>
      ), { duration: 2000, position: 'top-center' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error: any) {
      alert("ERREUR: " + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#141414] p-8 rounded-2xl border border-[#D4AF37]/30 w-full max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">Terminer Service</h3>
        <p className="text-white/60 mb-4">{service.name} - {service.price}</p>
        
        <label className="block text-white/40 text-sm mb-2">Méthode de paiement</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={() => setPaymentMethod('cash')} className={`py-2 rounded-lg text-sm font-bold border ${paymentMethod === 'cash' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-transparent text-white/60 border-white/20'}`}>Espèce</button>
          <button onClick={() => setPaymentMethod('card')} className={`py-2 rounded-lg text-sm font-bold border ${paymentMethod === 'card' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-transparent text-white/60 border-white/20'}`}>Carte Bancaire</button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-bold">Prix Payé (€)</label>
            <input type="number" value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white font-bold" />
          </div>
          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-bold">Pourboire (€)</label>
            <input type="number" value={tip} onChange={(e) => setTip(e.target.value)} className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white font-bold" />
          </div>
        </div>
        <button onClick={handleFinish} className="w-full py-3 bg-[#D4AF37] text-black rounded-lg font-bold">Encaisser & Terminer</button>
        <button onClick={onClose} className="w-full mt-2 text-white/40">Annuler</button>
      </div>
    </div>
  );
};

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

  const [resSubTab, setResSubTab] = useState<'today' | 'upcoming' | 'history'>('today');
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [isManualBookingOpen, setIsManualBookingOpen] = useState(false);

  // Strictly match barber using the barberId from the authenticated profile
  const currentBarber = barbers.find(b => b.id === user?.barberId) || barbers.find(b => b.email === user?.email);

  const today = new Date().toISOString().split('T')[0];

  const myBookings = bookings.filter(b => b.barberId === currentBarber?.id);
  const todayCompleted = myBookings.filter(b => b.status === 'completed' && b.date === today);
  
  const todayBookings = useMemo(() => {
    return myBookings.filter(b => b.date === today && b.status !== 'rejected').sort((a, b) => a.time.localeCompare(b.time));
  }, [myBookings, today]);

  const upcomingBookings = useMemo(() => {
    return myBookings.filter(b => b.date > today && b.status !== 'rejected').sort((a, b) => {
      return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
    });
  }, [myBookings, today]);

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

  return (
    <div className="min-h-screen bg-black pb-24">
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
                  <div key={b.id} className="bg-[#141414] p-6 rounded-2xl border border-[#D4AF37]/20 flex flex-col gap-4 hover:border-[#D4AF37]/45 transition-all relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-[#D4AF37]/5 to-transparent rounded-full blur-xl pointer-events-none group-hover:scale-150 transition-all duration-300" />
                    
                    {/* Top Row: Client Name, Avatar, Time & Status */}
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex gap-3 items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-[#D4AF37] to-[#FFD700] rounded-xl flex items-center justify-center font-bold text-black text-base shrink-0 animate-pulse">
                          {b.clientName ? b.clientName[0].toUpperCase() : 'C'}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-base leading-tight">{b.clientName}</h4>
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
                    <div className="flex items-center justify-between gap-3 pt-2">
                      <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border shrink-0 ${
                        b.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/25' :
                        b.status === 'pending' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25' :
                        b.status === 'approved' ? 'bg-blue-500/10 text-blue-400 border-blue-500/25' : 'bg-red-500/10 text-red-400 border-red-500/25'
                      }`}>
                        {b.status === 'pending' ? 'En Attente' : b.status === 'approved' ? 'Approuvé' : b.status === 'completed' ? 'Terminé' : 'Rejeté'}
                      </span>

                      {b.status !== 'completed' && b.status !== 'rejected' && (
                        <div className="flex gap-2 justify-end grow">
                          {b.clientPhone && b.clientPhone !== 'N/A' && (
                            <a 
                              href={`tel:${b.clientPhone}`} 
                              className="px-4 py-2 bg-white/5 text-white/80 rounded-xl text-xs font-bold border border-white/10 hover:bg-white/10 transition-colors shrink-0 text-center flex items-center justify-center"
                            >
                              Appeler
                            </a>
                          )}
                          {b.status === 'pending' ? (
                            <button 
                              onClick={() => { 
                                updateBookingStatus(b.id, 'approved'); 
                                toast.success('Rendez-vous approuvé !'); 
                              }} 
                              className="px-4 py-2 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-white rounded-xl text-xs font-black uppercase border border-green-500/20 transition-all"
                            >
                              Approuver
                            </button>
                          ) : (
                            <button 
                              onClick={() => setActiveBookingId(b.id)} 
                              className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black hover:scale-105 rounded-xl text-xs font-black uppercase transition-all shadow-md shadow-[#D4AF37]/10"
                            >
                              Terminer
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
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white mb-4">Vente de Produits</h3>
            <div className="grid grid-cols-2 gap-4">
              {products.map(product => (
                <div key={product.id} className="bg-[#141414] rounded-xl border border-white/10 overflow-hidden hover:border-[#D4AF37]/50 transition-all">
                  <div className="h-24 bg-white/5 flex items-center justify-center p-2">
                    <img src={product.image} className="max-h-full object-contain" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=150&h=150&fit=crop'; }} />
                  </div>
                  <div className="p-3">
                    <p className="text-white text-sm font-bold truncate">{product.name}</p>
                    <p className="text-white/40 text-[10px] mb-2">{product.category || 'Général'}</p>
                    <div className="flex justify-between items-center">
                      <p className="text-[#D4AF37] font-bold">€{product.sellPrice}</p>
                      <button onClick={() => setSaleModalOpen(true)} className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-white hover:bg-[#D4AF37] hover:text-black transition-colors">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'horaires' && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-white mb-4">Mes Horaires</h3>
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

      <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-white/5 flex z-40">
        <button onClick={() => setActiveTab('dashboard')} className={`flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><BarChart3 className="w-5 h-5" /><span className="text-[10px] font-bold">Gains</span></button>
        <button onClick={() => setActiveTab('reservations')} className={`flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'reservations' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><Calendar className="w-5 h-5" /><span className="text-[10px] font-bold">Agenda</span></button>
        <button onClick={() => setActiveTab('boutique')} className={`flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'boutique' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><ShoppingBag className="w-5 h-5" /><span className="text-[10px] font-bold">Boutique</span></button>
        <button onClick={() => setActiveTab('horaires')} className={`flex-1 p-3 flex flex-col items-center gap-1 ${activeTab === 'horaires' ? 'text-[#D4AF37]' : 'text-white/20'} hover:text-[#D4AF37] transition-colors`}><Clock className="w-5 h-5" /><span className="text-[10px] font-bold">Horaires</span></button>
      </div>

      <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"><div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div></div>}>
        {checkInModalOpen && <ScannerModal onClose={() => setCheckInModalOpen(false)} currentBarber={currentBarber} handleCheckInSuccess={handleCheckInSuccess} />}
        {settlementModalOpen && <SettlementModal onClose={() => setSettlementModalOpen(false)} todayEarnings={{total: stats.today.earnings}} currentBarber={currentBarber} addSettlement={addSettlement} />}
        {activeBookingId && <AddServiceModal bookingId={activeBookingId} onClose={() => setActiveBookingId(null)} bookings={bookings} services={services} updateBooking={updateBooking} />}
        {addServiceOpen && <WalkInModal onClose={() => setAddServiceOpen(false)} services={services} currentBarber={currentBarber} commissionRate={commissionRate} addBooking={addBooking} />}
        {saleModalOpen && <SaleModal onClose={() => setSaleModalOpen(false)} products={products} currentBarber={currentBarber} addSale={addSale} />}
        {isManualBookingOpen && <ManualBookingModal onClose={() => setIsManualBookingOpen(false)} preSelectedBarberId={currentBarber?.id} />}
      </Suspense>
    </div>
  );
}
