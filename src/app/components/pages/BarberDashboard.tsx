import { useState } from 'react';
import { motion } from 'motion/react';
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
import { Html5QrcodeScanner } from 'html5-qrcode';
import { useEffect } from 'react';

export default function BarberDashboard() {
  const { user, logout } = useAuth();
  const { 
    bookings, 
    services, 
    barbers, 
    updateBooking, 
    updateBookingStatus, 
    products, 
    addSale,
    addAttendance,
    attendance,
    businessInfo,
    addSettlement,
    settlements,
    updateBarberStatus
  } = useBusiness();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);
  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [walkinModalOpen, setWalkinModalOpen] = useState(false);
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);

  const parsePrice = (priceStr: string | undefined) => priceStr ? (parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0) : 0;

  // Mocked: finding the barber object for the current logged in user
  const currentBarber = barbers.find(b => b.username === user?.name) || barbers[0];
  const commissionRate = currentBarber?.commission || 50;

  const myBookings = bookings.filter(b => b.barberId === currentBarber?.id);
  const upcomingAppointments = myBookings
    .filter(b => b.status === 'approved' || b.status === 'pending')
    .map(b => ({
      id: b.id,
      client: b.clientName,
      service: services.find(s => s.id === b.serviceId)?.name || 'Unknown',
      time: b.time,
      date: b.date,
      clientPhone: b.clientPhone,
      status: b.status
    }));

  const completedBookings = myBookings.filter(b => b.status === 'completed');

  const calculateRevenue = (list: typeof myBookings) => {
    return list.reduce((sum, b) => sum + (b.pricePaid || parsePrice(services.find(s => s.id === b.serviceId)?.price)), 0);
  };
  const calculateTips = (list: typeof myBookings) => list.reduce((sum, b) => sum + (b.tip || 0), 0);

  const todayCompleted = completedBookings.filter(b => b.date === new Date().toISOString().split('T')[0]);
  
  const todayRevenue = calculateRevenue(todayCompleted);
  const todayTips = calculateTips(todayCompleted);

  const todayEarnings = {
    services: todayCompleted.length,
    revenue: todayRevenue,
    barberShare: (todayRevenue * commissionRate) / 100,
    shopShare: (todayRevenue * (100 - commissionRate)) / 100,
    tips: todayTips,
    total: ((todayRevenue * commissionRate) / 100) + todayTips,
  };

  const weekRevenue = calculateRevenue(completedBookings); // simplified week calc
  const monthRevenue = calculateRevenue(completedBookings); // simplified month calc

  const stats = {
    week: { earnings: weekRevenue, services: completedBookings.length },
    month: { earnings: monthRevenue, services: completedBookings.length }
  };

  const weeklyData = [
    { day: 'Lun', earnings: weekRevenue * 0.1 },
    { day: 'Mar', earnings: weekRevenue * 0.15 },
    { day: 'Mer', earnings: weekRevenue * 0.1 },
    { day: 'Jeu', earnings: weekRevenue * 0.2 },
    { day: 'Ven', earnings: weekRevenue * 0.25 },
    { day: 'Sam', earnings: weekRevenue * 0.2 },
    { day: 'Dim', earnings: 0 },
  ];

  const monthlyData = [
    { week: 'S1', earnings: monthRevenue * 0.2 },
    { week: 'S2', earnings: monthRevenue * 0.25 },
    { week: 'S3', earnings: monthRevenue * 0.2 },
    { week: 'S4', earnings: monthRevenue * 0.35 },
  ];

  const recentServices = todayCompleted.map(b => {
    return {
      id: b.id,
      client: b.clientName,
      service: services.find(s => s.id === b.serviceId)?.name || 'Unknown',
      time: b.time,
      price: b.pricePaid || 0,
      paymentMethod: b.paymentMethod
    };
  });

  const isSettledToday = (settlements || []).some(s => 
    s.barberId === currentBarber?.id && 
    s.date === new Date().toISOString().split('T')[0]
  );

  const isCheckedInToday = (attendance || []).some(a => 
    a.barberId === currentBarber?.id && 
    a.date === new Date().toISOString().split('T')[0]
  );

  const currentBalance = settlements
    .filter(s => s.barberId === currentBarber?.id)
    .reduce((sum, s) => sum + s.balance, 0);

  const SettlementModal = ({ onClose }: { onClose: () => void }) => {
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
      toast.success(balance <= 0 ? "Journée clôturée avec succès !" : `Journée clôturée. Reste à payer: €${balance.toFixed(2)}`);
      onClose();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          
          <h3 className="text-2xl font-bold text-white mb-6">Clôturer la journée</h3>
          
          <div className="space-y-4 mb-8">
            <div className="flex justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <span className="text-white/60">Total généré (Part Coiffeur + Tips)</span>
              <span className="text-white font-bold">€{todayEarnings.total.toFixed(2)}</span>
            </div>
            
            <div>
              <label className="block text-white/60 text-sm mb-2">Montant encaissé (ce que vous gardez)</label>
              <input
                type="number"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-xl text-white text-xl font-bold focus:outline-none focus:border-[#D4AF37]"
              />
            </div>

            <div className={`p-4 rounded-xl border ${balance > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-green-500/10 border-green-500/30'}`}>
              <div className="flex justify-between">
                <span className={balance > 0 ? 'text-red-400' : 'text-green-400'}>Reste à payer au salon</span>
                <span className={`font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>€{Math.abs(balance).toFixed(2)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={currentBarber?.image}
                alt={user?.name}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#D4AF37]"
              />
              <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-black ${
                currentBarber?.status === 'available' ? 'bg-green-500' :
                currentBarber?.status === 'busy' ? 'bg-red-500' :
                currentBarber?.status === 'break' ? 'bg-yellow-500' : 'bg-gray-500'
              }`} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Hello, {user?.name}</h1>
              <p className="text-white/60">Manage your station and bookings</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={currentBarber?.status || 'available'}
              onChange={(e) => updateBarberStatus(currentBarber.id, e.target.value as any)}
              className="px-4 py-2 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white text-sm focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="available">Available</option>
              <option value="busy">Busy</option>
              <option value="break">On Break</option>
              <option value="offline">Offline</option>
            </select>
            <button
              onClick={logout}
              className="p-3 bg-white/5 text-white/60 hover:text-white rounded-lg transition-colors border border-white/10"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

          <button
            onClick={handleSettle}
            className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-[#D4AF37]/30 transition-all active:scale-95"
          >
            Confirmer la clôture
          </button>
        </motion.div>
      </div>
    );
  };

  const ScannerModal = ({ onClose }: { onClose: () => void }) => {
    useEffect(() => {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      scanner.render(async (decodedText) => {
        try {
          const data = JSON.parse(decodedText);
          if (data.type === 'check-in' && data.barberId === currentBarber?.id) {
            scanner.clear();
            handleCheckIn(data.station);
          } else {
            toast.error("QR Code invalide pour votre session");
          }
        } catch (e) {
          toast.error("Format de QR Code invalide");
        }
      }, (error) => {
        // Silently handle scan errors (common during scanning)
      });

      return () => {
        scanner.clear();
      };
    }, []);

    const handleCheckIn = (station: string) => {
      // 1. Geolocation Check
      if (!navigator.geolocation) {
        toast.error("La géolocalisation n'est pas supportée par votre navigateur");
        return;
      }

      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        const shopLat = businessInfo.latitude || 48.8566;
        const shopLng = businessInfo.longitude || 2.3522;
        
        // Simple distance check (approx 100m)
        const distance = Math.sqrt(
          Math.pow(latitude - shopLat, 2) + Math.pow(longitude - shopLng, 2)
        );

        if (distance > 0.01) { // Mock distance threshold
          toast.error("Vous devez être au salon pour pointer !");
          return;
        }

        // 2. Punctuality Check
        const now = new Date();
        const checkInTime = now.toTimeString().split(' ')[0].substring(0, 5);
        const shiftStart = currentBarber?.shiftStart || "09:00";
        
        const [checkH, checkM] = checkInTime.split(':').map(Number);
        const [shiftH, shiftM] = shiftStart.split(':').map(Number);
        
        const isLate = (checkH > shiftH) || (checkH === shiftH && checkM > shiftM);

        addAttendance({
          barberId: currentBarber.id,
          date: now.toISOString().split('T')[0],
          checkInTime,
          station: station || currentBarber.station || "N/A",
          location: businessInfo.address,
          status: isLate ? 'late' : 'on-time'
        });

        toast.success(isLate ? "Pointage réussi (En retard)" : "Pointage réussi (À l'heure !)");
        onClose();
      }, (error) => {
        toast.error("Impossible d'accéder à votre position");
      });
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8 text-center"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          
          <div className="mb-6">
            <div className="w-16 h-16 bg-[#D4AF37]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-[#D4AF37]" />
            </div>
            <h3 className="text-2xl font-bold text-white">Scanner le QR Code</h3>
            <p className="text-white/60 text-sm mt-2">
              Scannez le code à votre station pour pointer.
            </p>
          </div>

          <div id="qr-reader" className="overflow-hidden rounded-2xl border-2 border-[#D4AF37]/20 bg-black"></div>
          
          <div className="mt-6 p-4 bg-[#D4AF37]/5 rounded-xl border border-[#D4AF37]/10">
            <p className="text-xs text-[#D4AF37]/70 uppercase font-bold tracking-wider mb-1">Votre Station</p>
            <p className="text-white font-bold text-lg">Station {currentBarber?.station || "N/A"}</p>
          </div>
        </motion.div>
      </div>
    );
  };


  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const AddServiceModal = ({ bookingId, onClose }: { bookingId: string; onClose: () => void }) => {
    const booking = myBookings.find(b => b.id === bookingId);
    const serviceObj = services.find(s => s.id === booking?.serviceId);
    
    const [tipAmount, setTipAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card');

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const price = parsePrice(serviceObj?.price);
      updateBooking(bookingId, { 
        status: 'completed', 
        pricePaid: price, 
        tip: parseFloat(tipAmount) || 0,
        paymentMethod
      });
      toast.success('Service enregistré et Terminé !');
      onClose();
    };

    if (!booking || !serviceObj) return null;

    const basePrice = parsePrice(serviceObj.price);

    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full md:max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-8 pb-12 md:pb-8 max-h-[90vh] overflow-y-auto"
        >
          <h3 className="text-2xl font-bold text-white mb-6">Service Terminé</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white/60 mb-2">Service Réalisé</label>
              <div className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white">
                {serviceObj.name} - {serviceObj.price}
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-lg border border-[#D4AF37]/20">
              <p className="text-white/60 text-sm mb-2">Répartition des Gains</p>
              <div className="space-y-1 text-white">
                <div className="flex justify-between">
                  <span>Prix du Service:</span>
                  <span className="text-[#D4AF37]">€{basePrice}</span>
                </div>
                <div className="flex justify-between">
                  <span>Votre Part ({commissionRate}%):</span>
                  <span className="text-green-400">€{(basePrice * commissionRate) / 100}</span>
                </div>
                <div className="flex justify-between">
                  <span>Part du Salon ({100 - commissionRate}%):</span>
                  <span className="text-white/60">€{(basePrice * (100 - commissionRate)) / 100}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-white mb-2">Moyen de paiement</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all border ${
                    paymentMethod === 'card' 
                      ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37] font-bold' 
                      : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                  }`}
                >
                  Carte Bancaire
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all border ${
                    paymentMethod === 'cash' 
                      ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37] font-bold' 
                      : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                  }`}
                >
                  Espèces
                </button>
              </div>
            </div>

            <div>
              <label className="block text-white mb-2">Pourboire (Optionnel)</label>
              <input
                type="number"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white focus:outline-none focus:border-[#D4AF37]"
                min="0"
                step="0.5"
              />
            </div>

            {tipAmount && parseFloat(tipAmount) > 0 && (
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <p className="text-green-400 font-bold">
                  Gains Totaux (Service + Pourboire): €
                  {(basePrice * commissionRate) / 100 + parseFloat(tipAmount)}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all"
              >
                Terminer & Encaisser
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  const SaleModal = ({ onClose }: { onClose: () => void }) => {
    const [selectedProduct, setSelectedProduct] = useState('');
    const [quantity, setQuantity] = useState(1);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      const product = products.find(p => p.id === selectedProduct);
      if (product && currentBarber) {
        addSale({
          productId: product.id,
          sellerId: currentBarber.id,
          quantity,
          buyPrice: product.buyPrice,
          sellPrice: product.sellPrice
        });
        toast.success('Vente enregistrée avec succès !');
        onClose();
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full md:max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-8 pb-12 md:pb-8 max-h-[90vh] overflow-y-auto"
        >
          <h3 className="text-2xl font-bold text-white mb-6">Vendre un Produit</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white mb-2">Sélectionner un produit</label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                required
              >
                <option value="">Choisir un produit...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} - €{p.sellPrice.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-white mb-2">Quantité</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
              />
            </div>

            {selectedProduct && (
              <div className="p-4 bg-white/5 rounded-lg border border-[#D4AF37]/20">
                <p className="text-white/60 text-sm">Prix Total à Payer :</p>
                <p className="text-2xl font-bold text-[#D4AF37]">
                  €{((products.find(p => p.id === selectedProduct)?.sellPrice || 0) * quantity).toFixed(2)}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all"
              >
                Confirmer Vente
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  const WalkinModal = ({ onClose }: { onClose: () => void }) => {
    const [selectedService, setSelectedService] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('card');
    const [tipAmount, setTipAmount] = useState('');

    const serviceObj = services.find(s => s.id === selectedService);
    const basePrice = parsePrice(serviceObj?.price);

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      console.log('Submitting Walk-in:', { selectedService, currentBarber });
      if (!currentBarber || !selectedService) {
        toast.error('Erreur: Coiffeur ou Service non sélectionné');
        return;
      }
      
      const now = new Date();
      
      try {
        addBooking({
          clientName: 'Client Sans RDV',
          clientEmail: '',
          clientPhone: '',
          serviceId: selectedService,
          barberId: currentBarber.id,
          date: now.toISOString().split('T')[0],
          time: now.toTimeString().split(' ')[0].substring(0, 5),
          status: 'completed',
          pricePaid: basePrice,
          tip: parseFloat(tipAmount) || 0,
          paymentMethod
        });
        
        toast.success('Coupe enregistrée avec succès !');
        onClose();
      } catch (err) {
        console.error(err);
        toast.error('Erreur lors de l\'enregistrement');
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full md:max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-8 pb-12 md:pb-8 max-h-[90vh] overflow-y-auto"
        >
          <h3 className="text-2xl font-bold text-white mb-6">Enregistrer une Coupe</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-white mb-2">Sélectionner le service</label>
              <select
                value={selectedService}
                onChange={(e) => setSelectedService(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                required
              >
                <option value="">Choisir un service...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} - {s.price}
                  </option>
                ))}
              </select>
            </div>

            {serviceObj && (
              <div className="p-4 bg-white/5 rounded-lg border border-[#D4AF37]/20">
                <p className="text-white/60 text-sm mb-2">Répartition des Gains</p>
                <div className="space-y-1 text-white">
                  <div className="flex justify-between">
                    <span>Prix du Service:</span>
                    <span className="text-[#D4AF37]">€{basePrice}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Votre Part ({commissionRate}%):</span>
                    <span className="text-green-400">€{(basePrice * commissionRate) / 100}</span>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-white mb-2">Moyen de paiement</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all border ${
                    paymentMethod === 'card' 
                      ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37] font-bold' 
                      : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                  }`}
                >
                  Carte Bancaire
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`px-4 py-3 rounded-lg flex items-center justify-center gap-2 transition-all border ${
                    paymentMethod === 'cash' 
                      ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37] font-bold' 
                      : 'bg-white/5 border-transparent text-white/60 hover:bg-white/10'
                  }`}
                >
                  Espèces
                </button>
              </div>
            </div>

            <div>
              <label className="block text-white mb-2">Pourboire (Optionnel)</label>
              <input
                type="number"
                value={tipAmount}
                onChange={(e) => setTipAmount(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white focus:outline-none focus:border-[#D4AF37]"
                min="0"
                step="0.5"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all"
              >
                Encaisser
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
            Elite Cuts - Barber
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-white">{user?.name}</p>
              <p className="text-white/40 text-sm">Barber Account</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5 text-white/60" />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 py-8 pb-32">
        {activeTab === 'dashboard' ? (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Tableau de bord</h2>
                <p className="text-white/60">Suivez vos performances et vos revenus</p>
              </div>
              
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <button
                    onClick={() => setWalkinModalOpen(true)}
                    className="p-4 bg-gradient-to-br from-[#D4AF37] to-[#FFD700] rounded-2xl text-black font-bold flex flex-col items-center justify-center gap-1 shadow-lg hover:shadow-[#D4AF37]/30 transition-all active:scale-95"
                  >
                    <Plus className="w-6 h-6" />
                    <span className="text-sm">Vendre Coupe</span>
                  </button>
                  <button
                    onClick={() => setSaleModalOpen(true)}
                    className="p-4 bg-[#1a1a1a] border border-[#D4AF37]/30 rounded-2xl text-white font-bold flex flex-col items-center justify-center gap-1 hover:bg-white/5 transition-all active:scale-95"
                  >
                    <ShoppingBag className="w-6 h-6 text-[#D4AF37]" />
                    <span className="text-sm">Vendre Produit</span>
                  </button>
                  <button
                    onClick={() => setCheckInModalOpen(true)}
                    disabled={isCheckedInToday}
                    className={`p-4 border rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                      isCheckedInToday 
                        ? 'bg-green-500/10 border-green-500/30 text-green-400 cursor-not-allowed'
                        : 'bg-[#1a1a1a] border-[#D4AF37]/30 text-white hover:bg-white/5'
                    }`}
                  >
                    {isCheckedInToday ? <CheckCircle className="w-6 h-6" /> : <Clock className="w-6 h-6 text-[#D4AF37]" />}
                    <span className="text-sm">{isCheckedInToday ? 'Pointé' : 'Pointer'}</span>
                  </button>
                  <button
                    onClick={() => setSettlementModalOpen(true)}
                    disabled={isSettledToday}
                    className={`p-4 border rounded-2xl font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${
                      isSettledToday 
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 cursor-not-allowed'
                        : 'bg-[#1a1a1a] border-[#D4AF37]/30 text-white hover:bg-white/5'
                    }`}
                  >
                    <Wallet className="w-6 h-6 text-[#D4AF37]" />
                    <span className="text-sm">{isSettledToday ? 'Clôturé' : 'Fin de jour'}</span>
                  </button>
                  <div className="p-4 bg-[#1a1a1a] border border-white/5 rounded-2xl text-white flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Station</span>
                    <span className="text-lg font-bold text-[#D4AF37]">{currentBarber?.station || "N/A"}</span>
                  </div>
                  <div className="p-4 bg-[#1a1a1a] border border-white/5 rounded-2xl text-white flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Balance</span>
                    <span className={`text-lg font-bold ${currentBalance > 0 ? 'text-red-400' : 'text-green-400'}`}>
                      €{currentBalance.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('schedule')}
              className="hidden md:flex px-6 py-3 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all items-center gap-2 active:scale-95"
            >
              <Calendar className="w-5 h-5" />
              Planning
            </button>


        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <span className="text-white/60 text-sm">Today</span>
            </div>
            <p className="text-4xl font-bold text-white mb-1">€{todayEarnings.total}</p>
            <p className="text-white/60 text-sm">{todayEarnings.services} services completed</p>
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Services:</span>
                <span className="text-green-400">€{todayEarnings.barberShare}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/60">Tips:</span>
                <span className="text-[#D4AF37]">€{todayEarnings.tips}</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-600">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <span className="text-white/60 text-sm">This Week</span>
            </div>
            <p className="text-4xl font-bold text-white mb-1">€{stats.week.earnings}</p>
            <p className="text-white/60 text-sm">{stats.week.services} services completed</p>
            <div className="mt-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <TrendingUp className="w-4 h-4" />
                +12% from last week
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#FFD700]">
                <Wallet className="w-6 h-6 text-black" />
              </div>
              <span className="text-white/60 text-sm">This Month</span>
            </div>
            <p className="text-4xl font-bold text-white mb-1">€{stats.month.earnings}</p>
            <p className="text-white/60 text-sm">{stats.month.services} services completed</p>
            <div className="mt-4">
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <TrendingUp className="w-4 h-4" />
                +18% from last month
              </div>
            </div>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
          >
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
              Weekly Performance
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="day" stroke="#a3a3a3" />
                <YAxis stroke="#a3a3a3" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(212, 175, 55, 0.2)',
                    borderRadius: '8px',
                  }}
                />
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

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
          >
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
              Monthly Earnings Trend
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                <XAxis dataKey="week" stroke="#a3a3a3" />
                <YAxis stroke="#a3a3a3" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1a1a1a',
                    border: '1px solid rgba(212, 175, 55, 0.2)',
                    borderRadius: '8px',
                  }}
                />
                <Line type="monotone" dataKey="earnings" stroke="#D4AF37" strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

            <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <Scissors className="w-5 h-5 text-[#D4AF37]" />
                Services complétés aujourd'hui
              </h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {recentServices.map((service) => (
                  <div
                    key={service.id}
                    className="p-4 bg-white/5 rounded-lg border border-[#D4AF37]/10 hover:border-[#D4AF37]/30 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-white font-bold">{service.client}</p>
                        <p className="text-white/60 text-sm">{service.service}</p>
                      </div>
                      <span className="text-white/60 text-sm">{service.time}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-white/40">Prix</p>
                        <p className="text-white">€{service.price}</p>
                      </div>
                      <div>
                        <p className="text-white/40">Méthode</p>
                        <p className="text-[#D4AF37] capitalize">{service.paymentMethod}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {recentServices.length === 0 && (
                  <div className="py-8 text-center text-white/40 italic">
                    Aucun service complété aujourd'hui.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <h2 className="text-3xl font-bold text-white mb-2">Planning</h2>
            <p className="text-white/60 mb-6">Vos rendez-vous à venir</p>
            
            <div className="space-y-4">
              {upcomingAppointments.length === 0 ? (
                <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <p className="text-white/40 italic">Aucun rendez-vous prévu.</p>
                </div>
              ) : (
                upcomingAppointments.map((appointment) => (
                  <motion.div
                    key={appointment.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#FFD700] flex items-center justify-center">
                            <User className="w-6 h-6 text-black" />
                          </div>
                          <div>
                            <p className="text-xl font-bold text-white">{appointment.client}</p>
                            <p className="text-white/60">{appointment.service}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-[#D4AF37]">{appointment.time}</p>
                          <p className="text-white/40 text-sm">{appointment.date}</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3 pt-4 border-t border-white/10">
                        <a 
                          href={`tel:${appointment.clientPhone}`}
                          className="flex-1 py-3 bg-white/5 text-white rounded-xl hover:bg-white/10 transition-all flex justify-center items-center gap-2 font-bold"
                        >
                          <Phone className="w-5 h-5" /> Appeler
                        </a>
                        
                        {appointment.status === 'pending' ? (
                          <>
                            <button 
                              onClick={() => {
                                updateBookingStatus(appointment.id, 'approved');
                                toast.success('Réservation approuvée !');
                              }}
                              className="flex-1 py-3 bg-green-500/20 text-green-400 rounded-xl hover:bg-green-500/30 transition-all flex justify-center items-center gap-2 font-bold"
                            >
                              <CheckCircle className="w-5 h-5" /> Approuver
                            </button>
                            <button 
                              onClick={() => {
                                updateBookingStatus(appointment.id, 'rejected');
                                toast.error('Réservation rejetée');
                              }}
                              className="px-6 py-3 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition-all flex justify-center items-center"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <button 
                            onClick={() => setActiveBookingId(appointment.id)}
                            className="flex-1 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl hover:shadow-lg hover:shadow-[#D4AF37]/30 transition-all flex justify-center items-center gap-2 font-bold"
                          >
                            <CheckCircle className="w-5 h-5" /> Terminer & Encaisser
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {activeBookingId && <AddServiceModal bookingId={activeBookingId} onClose={() => setActiveBookingId(null)} />}
      {saleModalOpen && <SaleModal onClose={() => setSaleModalOpen(false)} />}
      {walkinModalOpen && <WalkinModal onClose={() => setWalkinModalOpen(false)} />}
      {checkInModalOpen && <ScannerModal onClose={() => setCheckInModalOpen(false)} />}
      {settlementModalOpen && <SettlementModal onClose={() => setSettlementModalOpen(false)} />}

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-[#D4AF37]/20 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide z-40">
        {[
          { id: 'dashboard', icon: DollarSign, label: 'Gains' },
          { id: 'schedule', icon: Calendar, label: 'Planning' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 snap-center flex flex-col items-center justify-center p-3 gap-1 transition-colors active:scale-95 ${
              activeTab === tab.id
                ? 'text-[#D4AF37]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-6 h-6" />
            <span className="text-xs font-medium text-center">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
