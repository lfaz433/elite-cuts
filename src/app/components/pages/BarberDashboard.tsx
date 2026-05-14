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
import { Html5Qrcode } from 'html5-qrcode';
import type { Barber, Service, Product, Booking } from '../context/BusinessContext';

// --- Sub-components ---

const SettlementModal = ({ onClose, todayEarnings, currentBarber, addSettlement }: any) => {
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
    toast.success("Journée clôturée !");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40"><X /></button>
        <h3 className="text-2xl font-bold text-white mb-6">Clôturer</h3>
        <div className="space-y-4 mb-8">
          <div className="flex justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <span className="text-white/60">Total</span>
            <span className="text-white font-bold">€{todayEarnings.total.toFixed(2)}</span>
          </div>
          <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-xl text-white text-xl font-bold" />
        </div>
        <button onClick={handleSettle} className="w-full py-4 bg-[#D4AF37] text-black rounded-xl font-bold">Confirmer</button>
      </motion.div>
    </div>
  );
};

const ScannerModal = ({ onClose, currentBarber, handleCheckInSuccess }: any) => {
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    const html5QrCode = new Html5Qrcode("qr-reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 15, qrbox: 250 }, (text) => {
      const data = JSON.parse(text);
      if (data.type === 'check-in' && data.barberId === currentBarber?.id) {
        html5QrCode.stop().then(() => handleCheckInSuccess(data.station));
      }
    }, () => {}).then(() => setIsLoading(false)).catch(() => onClose());
    return () => { if (html5QrCode.isScanning) html5QrCode.stop(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#141414] rounded-3xl p-8 text-center border border-[#D4AF37]/30">
        <button onClick={onClose} className="absolute top-4 right-4 text-white/40"><X /></button>
        <h3 className="text-xl font-bold text-white mb-6">Scanner QR</h3>
        <div className="relative aspect-square mb-4">
          {isLoading && <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10"><div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div></div>}
          <div id="qr-reader" className="w-full h-full rounded-2xl overflow-hidden bg-black"></div>
        </div>
      </div>
    </div>
  );
};

const AddServiceModal = ({ bookingId, onClose, bookings, services, updateBooking }: any) => {
  const booking = bookings.find((b: any) => b.id === bookingId);
  const service = services.find((s: any) => s.id === booking?.serviceId);
  const [tip, setTip] = useState('0');
  if (!booking || !service) return null;
  const handleFinish = () => {
    const price = parseInt(service.price.replace(/[^0-9]/g, ''));
    updateBooking(bookingId, { status: 'completed', pricePaid: price, tip: parseFloat(tip) || 0, paymentMethod: 'card' });
    toast.success("Service terminé !");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#141414] p-8 rounded-2xl border border-[#D4AF37]/30 w-full max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">Terminer Service</h3>
        <p className="text-white/60 mb-4">{service.name} - {service.price}</p>
        <label className="block text-white/40 text-sm mb-2">Pourboire (Tip)</label>
        <input type="number" value={tip} onChange={(e) => setTip(e.target.value)} className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white mb-6" />
        <button onClick={handleFinish} className="w-full py-3 bg-[#D4AF37] text-black rounded-lg font-bold">Encaisser & Terminer</button>
        <button onClick={onClose} className="w-full mt-2 text-white/40">Annuler</button>
      </div>
    </div>
  );
};

// --- Main Component ---

export default function BarberDashboard() {
  const { user, logout } = useAuth();
  const { bookings, services, barbers, updateBooking, updateBookingStatus, products, addSale, addAttendance, attendance, businessInfo, addSettlement, settlements, updateBarberStatus } = useBusiness();
  const navigate = useNavigate();
  
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);

  const currentBarber = barbers.find(b => b.username === user?.name) || barbers[0];
  const today = new Date().toISOString().split('T')[0];
  const myBookings = bookings.filter(b => b.barberId === currentBarber?.id);
  const todayCompleted = myBookings.filter(b => b.status === 'completed' && b.date === today);
  
  const todayRevenue = todayCompleted.reduce((sum, b) => sum + (b.pricePaid || 0), 0);
  const todayTips = todayCompleted.reduce((sum, b) => sum + (b.tip || 0), 0);
  const commissionRate = currentBarber?.commission || 50;
  const todayTotal = (todayRevenue * commissionRate / 100) + todayTips;

  const isCheckedInToday = (attendance || []).some(a => a.barberId === currentBarber?.id && a.date === today);
  const currentBalance = (settlements || []).filter(s => s.barberId === currentBarber?.id).reduce((sum, s) => sum + s.balance, 0);

  const handleCheckInSuccess = (station: string) => {
    addAttendance({
      barberId: currentBarber.id,
      date: today,
      checkInTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
      station: station || "N/A",
      location: businessInfo.address,
      status: 'on-time'
    });
    setCheckInModalOpen(false);
    toast.success("Pointé !");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black pb-24">
      {/* Header */}
      <div className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 p-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <img src={currentBarber?.image} className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]" />
            <div>
              <p className="text-white font-bold text-sm">Hello, {user.name}</p>
              <select value={currentBarber?.status} onChange={(e) => updateBarberStatus(currentBarber.id, e.target.value as any)} className="bg-transparent text-[10px] text-white/40 focus:outline-none">
                <option value="available">Available</option>
                <option value="busy">Busy</option>
                <option value="break">Break</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            {!isCheckedInToday && <button onClick={() => setCheckInModalOpen(true)} className="p-2 bg-[#D4AF37]/10 text-[#D4AF37] rounded-lg text-xs font-bold border border-[#D4AF37]/20">Pointage</button>}
            <button onClick={() => setSettlementModalOpen(true)} className="p-2 bg-white/5 text-white/60 rounded-lg"><Wallet className="w-4 h-4" /></button>
            <button onClick={logout} className="p-2 bg-red-500/10 text-red-500 rounded-lg"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        {activeTab === 'dashboard' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-[#141414] p-4 rounded-xl border border-white/5"><p className="text-white/40 text-[10px]">Gains</p><p className="text-xl font-bold text-white">€{todayTotal.toFixed(2)}</p></div>
              <div className="bg-[#141414] p-4 rounded-xl border border-white/5"><p className="text-white/40 text-[10px]">Balance</p><p className="text-xl font-bold text-red-400">€{currentBalance.toFixed(2)}</p></div>
            </div>
            <div className="bg-[#141414] p-4 rounded-xl border border-white/5">
              <h3 className="text-white text-xs font-bold mb-3">Services récents</h3>
              {todayCompleted.map(b => (
                <div key={b.id} className="flex justify-between py-2 border-b border-white/5 last:border-0"><p className="text-white text-xs">{b.clientName}</p><p className="text-[#D4AF37] text-xs font-bold">€{b.pricePaid}</p></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {myBookings.filter(b => b.status === 'approved' || b.status === 'pending').map(b => (
              <div key={b.id} className="bg-[#141414] p-4 rounded-xl border border-[#D4AF37]/20">
                <div className="flex justify-between mb-3">
                  <div><p className="text-white font-bold">{b.clientName}</p><p className="text-white/40 text-xs">{services.find(s => s.id === b.serviceId)?.name}</p></div>
                  <p className="text-[#D4AF37] font-bold">{b.time}</p>
                </div>
                <div className="flex gap-2">
                  <a href={`tel:${b.clientPhone}`} className="flex-1 bg-white/5 text-white py-2 rounded-lg text-center text-xs">Appeler</a>
                  {b.status === 'pending' ? <button onClick={() => updateBookingStatus(b.id, 'approved')} className="flex-1 bg-green-500/20 text-green-400 py-2 rounded-lg text-xs font-bold">Approuver</button> : <button onClick={() => setActiveBookingId(b.id)} className="flex-1 bg-[#D4AF37] text-black py-2 rounded-lg text-xs font-bold">Terminer</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-white/5 flex">
        <button onClick={() => setActiveTab('dashboard')} className={`flex-1 p-4 flex flex-col items-center gap-1 ${activeTab === 'dashboard' ? 'text-[#D4AF37]' : 'text-white/20'}`}><DollarSign className="w-5 h-5" /><span className="text-[8px]">Gains</span></button>
        <button onClick={() => setActiveTab('schedule')} className={`flex-1 p-4 flex flex-col items-center gap-1 ${activeTab === 'schedule' ? 'text-[#D4AF37]' : 'text-white/20'}`}><Calendar className="w-5 h-5" /><span className="text-[8px]">Planning</span></button>
      </div>

      <AnimatePresence>
        {checkInModalOpen && <ScannerModal onClose={() => setCheckInModalOpen(false)} currentBarber={currentBarber} handleCheckInSuccess={handleCheckInSuccess} />}
        {settlementModalOpen && <SettlementModal onClose={() => setSettlementModalOpen(false)} todayEarnings={{total: todayTotal}} currentBarber={currentBarber} addSettlement={addSettlement} />}
        {activeBookingId && <AddServiceModal bookingId={activeBookingId} onClose={() => setActiveBookingId(null)} bookings={bookings} services={services} updateBooking={updateBooking} />}
      </AnimatePresence>
    </div>
  );
}
