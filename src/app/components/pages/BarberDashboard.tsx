import { useState, useEffect } from 'react';
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
  ShoppingBag,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Html5Qrcode } from 'html5-qrcode';
import type { Barber, Service, Product, Booking } from '../context/BusinessContext';

// --- Sub-components (extracted for performance and reliability) ---

const SettlementModal = ({ 
  onClose, 
  todayEarnings, 
  currentBarber, 
  addSettlement 
}: { 
  onClose: () => void; 
  todayEarnings: any; 
  currentBarber: Barber; 
  addSettlement: any;
}) => {
  const [amountPaid, setAmountPaid] = useState(todayEarnings.total.toString());
  const balance = todayEarnings.total - parseFloat(amountPaid || '0');

  const handleSettle = () => {
    addSettlement({
      barberId: currentBarber.id,
      date: new Date().toISOString().split('T')[0],
      earnings: todayEarnings.total,
      paid: parseFloat(amountPaid || '0'),
      balance: balance,
      status: balance <= 0 ? 'settled' : 'pending'
    });
    toast.success(balance <= 0 ? "Journée clôturée !" : `Reste à payer: €${balance.toFixed(2)}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white"><X /></button>
        <h3 className="text-2xl font-bold text-white mb-6">Clôturer la journée</h3>
        <div className="space-y-4 mb-8">
          <div className="flex justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <span className="text-white/60">Total généré</span>
            <span className="text-white font-bold">€{todayEarnings.total.toFixed(2)}</span>
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">Montant encaissé</label>
            <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-xl text-white text-xl font-bold focus:outline-none" />
          </div>
          <div className={`p-4 rounded-xl border ${balance > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
            <div className="flex justify-between">
              <span className={balance > 0 ? 'text-red-400' : 'text-green-400'}>Reste au salon</span>
              <span className="font-bold">€{Math.abs(balance).toFixed(2)}</span>
            </div>
          </div>
        </div>
        <button onClick={handleSettle} className="w-full py-4 bg-[#D4AF37] text-black rounded-xl font-bold hover:scale-[1.02] transition-transform">Confirmer</button>
      </motion.div>
    </div>
  );
};

const ScannerModal = ({ 
  onClose, 
  currentBarber, 
  handleCheckInSuccess 
}: { 
  onClose: () => void; 
  currentBarber: Barber; 
  handleCheckInSuccess: (station: string) => void 
}) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const html5QrCode = new Html5Qrcode("qr-reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };
    let isMounted = true;

    const startScanner = async () => {
      try {
        await new Promise(r => setTimeout(r, 500));
        if (!isMounted) return;
        
        await html5QrCode.start(
          { facingMode: "environment" },
          config,
          async (decodedText) => {
            try {
              const data = JSON.parse(decodedText);
              if (data.type === 'check-in' && data.barberId === currentBarber?.id) {
                await html5QrCode.stop();
                handleCheckInSuccess(data.station);
              } else {
                toast.error("QR Code invalide");
              }
            } catch (e) {
              toast.error("Format invalide");
            }
          },
          () => {}
        );
        setIsLoading(true); // wait, should be false
        setIsLoading(false);
      } catch (err) {
        console.error(err);
        toast.error("Caméra indisponible");
        onClose();
      }
    };

    startScanner();
    return () => {
      isMounted = false;
      if (html5QrCode.isScanning) html5QrCode.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8 text-center">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white"><X /></button>
        <h3 className="text-2xl font-bold text-white mb-6">Pointer (Check-in)</h3>
        <div className="relative mb-6">
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 rounded-2xl"><div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div></div>}
          <div id="qr-reader" className="overflow-hidden rounded-2xl border-2 border-[#D4AF37]/20 bg-black aspect-square [&>video]:object-cover"></div>
          <div className="absolute inset-0 pointer-events-none">
             <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-[#D4AF37] rounded-tl-xl m-4"></div>
             <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-[#D4AF37] rounded-tr-xl m-4"></div>
             <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-[#D4AF37] rounded-bl-xl m-4"></div>
             <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-[#D4AF37] rounded-br-xl m-4"></div>
             <motion.div animate={{ top: ['10%', '90%', '10%'] }} transition={{ duration: 3, repeat: Infinity, ease: "linear" }} className="absolute left-4 right-4 h-0.5 bg-[#D4AF37]/50 shadow-[0_0_15px_#D4AF37]" />
          </div>
        </div>
        <p className="text-white font-bold">Station {currentBarber?.station || "N/A"}</p>
      </motion.div>
    </div>
  );
};

// --- Main Dashboard Component ---

export default function BarberDashboard() {
  const { user, logout } = useAuth();
  const { 
    bookings, services, barbers, updateBooking, updateBookingStatus, 
    products, addSale, addAttendance, attendance, businessInfo, 
    addSettlement, settlements, updateBarberStatus 
  } = useBusiness();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [walkinModalOpen, setWalkinModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);

  const parsePrice = (priceStr: string | undefined) => priceStr ? (parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0) : 0;

  const currentBarber = barbers.find(b => b.username === user?.name) || barbers[0];
  const commissionRate = currentBarber?.commission || 50;

  const myBookings = bookings.filter(b => b.barberId === currentBarber?.id);
  const completedBookings = myBookings.filter(b => b.status === 'completed');
  const today = new Date().toISOString().split('T')[0];
  const todayCompleted = completedBookings.filter(b => b.date === today);

  const calculateRevenue = (list: any[]) => list.reduce((sum, b) => sum + (b.pricePaid || parsePrice(services.find(s => s.id === b.serviceId)?.price)), 0);
  const calculateTips = (list: any[]) => list.reduce((sum, b) => sum + (b.tip || 0), 0);

  const todayRevenue = calculateRevenue(todayCompleted);
  const todayTips = calculateTips(todayCompleted);
  const todayTotal = ((todayRevenue * commissionRate) / 100) + todayTips;

  const todayEarnings = { total: todayTotal, revenue: todayRevenue, tips: todayTips, barberShare: (todayRevenue * commissionRate) / 100 };

  const isCheckedInToday = (attendance || []).some(a => a.barberId === currentBarber?.id && a.date === today);
  const currentBalance = settlements.filter(s => s.barberId === currentBarber?.id).reduce((sum, s) => sum + s.balance, 0);

  const handleCheckInSuccess = (station: string) => {
    if (!navigator.geolocation) {
      toast.error("Géo non supportée");
      return;
    }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      const shopLat = businessInfo.latitude || 48.8566;
      const shopLng = businessInfo.longitude || 2.3522;
      const dist = Math.sqrt(Math.pow(latitude - shopLat, 2) + Math.pow(longitude - shopLng, 2));
      
      if (dist > 0.01) {
        toast.error("Vous n'êtes pas au salon !");
        return;
      }
      
      const now = new Date();
      const time = now.toTimeString().split(' ')[0].substring(0, 5);
      const isLate = time > (currentBarber?.shiftStart || "09:00");
      
      addAttendance({
        barberId: currentBarber.id,
        date: today,
        checkInTime: time,
        station: station || currentBarber.station || "N/A",
        location: businessInfo.address,
        status: isLate ? 'late' : 'on-time'
      });
      toast.success(isLate ? "Pointé (En retard)" : "Pointé (À l'heure !)");
      setCheckInModalOpen(false);
    });
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-24 md:pb-8">
      {/* Header */}
      <div className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img src={currentBarber?.image} alt={user.name} className="w-12 h-12 rounded-full object-cover border-2 border-[#D4AF37]" />
              <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black ${currentBarber?.status === 'available' ? 'bg-green-500' : 'bg-red-500'}`} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Hello, {user.name}</h1>
              <div className="flex items-center gap-2">
                <select 
                  value={currentBarber?.status || 'available'} 
                  onChange={(e) => updateBarberStatus(currentBarber.id, e.target.value as any)}
                  className="bg-transparent text-white/60 text-xs focus:outline-none"
                >
                  <option value="available">Available</option>
                  <option value="busy">Busy</option>
                  <option value="break">Break</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!isCheckedInToday && (
              <button onClick={() => setCheckInModalOpen(true)} className="px-4 py-2 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 rounded-lg text-sm font-bold flex items-center gap-2">
                <Clock className="w-4 h-4" /> Pointage
              </button>
            )}
            <button onClick={() => setSettlementModalOpen(true)} className="p-2 bg-white/5 text-white/60 rounded-lg"><Wallet className="w-5 h-5" /></button>
            <button onClick={logout} className="p-2 bg-red-500/10 text-red-500 rounded-lg"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
             {/* Stats Cards */}
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#141414] p-4 rounded-2xl border border-[#D4AF37]/10">
                  <p className="text-white/40 text-xs mb-1">Gains du jour</p>
                  <p className="text-2xl font-bold text-white">€{todayEarnings.total.toFixed(2)}</p>
                </div>
                <div className="bg-[#141414] p-4 rounded-2xl border border-[#D4AF37]/10">
                  <p className="text-white/40 text-xs mb-1">Services</p>
                  <p className="text-2xl font-bold text-white">{todayEarnings.services}</p>
                </div>
                <div className="bg-[#141414] p-4 rounded-2xl border border-[#D4AF37]/10">
                  <p className="text-white/40 text-xs mb-1">Tips</p>
                  <p className="text-2xl font-bold text-[#D4AF37]">€{todayEarnings.tips}</p>
                </div>
                <div className="bg-[#141414] p-4 rounded-2xl border border-[#D4AF37]/10">
                  <p className="text-white/40 text-xs mb-1">Balance Salon</p>
                  <p className="text-2xl font-bold text-red-400">€{currentBalance.toFixed(2)}</p>
                </div>
             </div>

             {/* Charts or Service List */}
             <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/10 p-6">
                <h3 className="text-white font-bold mb-4">Services complétés</h3>
                <div className="space-y-3">
                  {todayCompleted.length === 0 ? (
                    <p className="text-white/20 text-center py-8 italic">Aucun service aujourd'hui</p>
                  ) : (
                    todayCompleted.map(b => (
                      <div key={b.id} className="flex justify-between items-center p-3 bg-white/5 rounded-lg">
                        <div>
                          <p className="text-white font-medium">{b.clientName}</p>
                          <p className="text-white/40 text-xs">{services.find(s => s.id === b.serviceId)?.name}</p>
                        </div>
                        <p className="text-[#D4AF37] font-bold">€{b.pricePaid}</p>
                      </div>
                    ))
                  )}
                </div>
             </div>
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Mon Planning</h2>
            <div className="space-y-4">
              {bookings.filter(b => b.barberId === currentBarber?.id && (b.status === 'approved' || b.status === 'pending')).map(b => (
                <div key={b.id} className="bg-[#141414] p-6 rounded-2xl border border-[#D4AF37]/20">
                  <div className="flex justify-between mb-4">
                    <div>
                      <p className="text-xl font-bold text-white">{b.clientName}</p>
                      <p className="text-white/60">{services.find(s => s.id === b.serviceId)?.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-[#D4AF37]">{b.time}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:${b.clientPhone}`} className="flex-1 py-2 bg-white/5 text-white rounded-lg text-center flex items-center justify-center gap-2">
                      <Phone className="w-4 h-4" /> Appeler
                    </a>
                    {b.status === 'pending' ? (
                      <button onClick={() => updateBookingStatus(b.id, 'approved')} className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg font-bold">Approuver</button>
                    ) : (
                      <button onClick={() => setActiveBookingId(b.id)} className="flex-1 py-2 bg-[#D4AF37] text-black rounded-lg font-bold">Terminer</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Nav Bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-[#D4AF37]/20 flex z-40">
        <button onClick={() => setActiveTab('dashboard')} className={`flex-1 p-4 flex flex-col items-center ${activeTab === 'dashboard' ? 'text-[#D4AF37]' : 'text-white/40'}`}>
          <DollarSign className="w-6 h-6" /><span className="text-[10px]">Gains</span>
        </button>
        <button onClick={() => setActiveTab('schedule')} className={`flex-1 p-4 flex flex-col items-center ${activeTab === 'schedule' ? 'text-[#D4AF37]' : 'text-white/40'}`}>
          <Calendar className="w-6 h-6" /><span className="text-[10px]">Planning</span>
        </button>
      </div>

      {/* Modals Render */}
      <AnimatePresence>
        {checkInModalOpen && <ScannerModal onClose={() => setCheckInModalOpen(false)} currentBarber={currentBarber} handleCheckInSuccess={handleCheckInSuccess} />}
        {settlementModalOpen && <SettlementModal onClose={() => setSettlementModalOpen(false)} todayEarnings={todayEarnings} currentBarber={currentBarber} addSettlement={addSettlement} />}
      </AnimatePresence>
    </div>
  );
}
