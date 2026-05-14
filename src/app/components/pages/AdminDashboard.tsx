import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LayoutDashboard,
  Calendar,
  Users,
  Scissors,
  DollarSign,
  Settings,
  LogOut,
  TrendingUp,
  CheckCircle,
  Clock,
  X,
  Bell,
  Image as ImageIcon,
  Edit,
  Trash2,
  Phone,
  Star,
  ShoppingBag,
  Plus,
  Mail,
  Lock,
  Wallet,
  Archive,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import type { Barber, Service, Product } from '../context/BusinessContext';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { 
    services, 
    barbers, 
    bookings, 
    businessInfo, 
    updateBookingStatus,
    addService,
    updateService,
    deleteService,
    updateBusinessInfo,
    addBarber,
    updateBarber,
    deleteBarber,
    addToGallery,
    removeFromGallery,
    updateBooking,
    deleteBooking,
    products,
    sales,
    addProduct,
    updateProduct,
    deleteProduct,
    addSale,
    attendance,
    settlements,
    addSettlement,
    resetBarberBalance
  } = useBusiness();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateFilter, setDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'custom'>('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [barberFilter, setBarberFilter] = useState('all');

  // Modals for adding/editing items
  const [barberModalOpen, setBarberModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleImageUpload = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const parsePrice = (priceStr: string | undefined) => priceStr ? (parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0) : 0;
  
  const getFilteredDateRange = () => {
    const now = new Date();
    let start = new Date(0);
    let end = new Date(3000, 0, 1);

    try {
      if (dateFilter === 'day') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (dateFilter === 'week') {
        const first = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
        start = new Date(now.getFullYear(), now.getMonth(), first, 0, 0, 0, 0);
        end = new Date(start.getTime());
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
      } else if (dateFilter === 'month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (dateFilter === 'custom') {
        if (customDateRange.start) {
          start = new Date(customDateRange.start);
          if (!isNaN(start.getTime())) start.setHours(0, 0, 0, 0);
        }
        if (customDateRange.end) {
          end = new Date(customDateRange.end);
          if (!isNaN(end.getTime())) end.setHours(23, 59, 59, 999);
        }
      }
    } catch (e) {
      console.error("Date filter error", e);
    }
    return { start, end };
  };

  const isDateInRange = (dateStr: string) => {
    if (dateFilter === 'all') return true;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const { start, end } = getFilteredDateRange();
    return date >= start && date <= end;
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter(b => {
      const dateMatch = isDateInRange(b.date);
      const barberMatch = barberFilter === 'all' || b.barberId === barberFilter;
      return dateMatch && barberMatch;
    });
  }, [bookings, dateFilter, customDateRange, barberFilter]);

  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const dateMatch = isDateInRange(s.date);
      const barberMatch = barberFilter === 'all' || s.sellerId === barberFilter;
      return dateMatch && barberMatch;
    });
  }, [sales, dateFilter, customDateRange, barberFilter]);

  const filteredAttendance = useMemo(() => {
    return (attendance || []).filter(a => {
      const dateMatch = isDateInRange(a.date);
      const barberMatch = barberFilter === 'all' || a.barberId === barberFilter;
      return dateMatch && barberMatch;
    });
  }, [attendance, dateFilter, customDateRange, barberFilter]);

  const filteredSettlements = useMemo(() => {
    return (settlements || []).filter(s => {
      const dateMatch = isDateInRange(s.date);
      const barberMatch = barberFilter === 'all' || s.barberId === barberFilter;
      return dateMatch && barberMatch;
    });
  }, [settlements, dateFilter, customDateRange, barberFilter]);

  const approvedBookings = filteredBookings.filter(b => b.status === 'completed' || b.status === 'approved');

  const revenueData = useMemo(() => {
    const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const data = months.map(month => ({ month, revenue: 0 }));
    
    approvedBookings.forEach(booking => {
      const date = new Date(booking.date);
      if (!isNaN(date.getTime())) {
        const monthIndex = date.getMonth();
        const service = services.find(s => s.id === booking.serviceId);
        if (service) {
          data[monthIndex].revenue += parsePrice(service.price);
        }
      }
    });
    // If there's data, return the current and past 4 months for a good view
    const currentMonth = new Date().getMonth();
    const visibleData = [];
    for (let i = 4; i >= 0; i--) {
      let m = currentMonth - i;
      if (m < 0) m += 12;
      visibleData.push(data[m]);
    }
    return visibleData;
  }, [approvedBookings, services]);

  const bookingsData = useMemo(() => {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const data = days.map(day => ({ day, bookings: 0 }));
    
    approvedBookings.forEach(booking => {
      const date = new Date(booking.date);
      if (!isNaN(date.getTime())) {
        data[date.getDay()].bookings += 1;
      }
    });
    const sun = data.shift();
    if (sun) data.push(sun);
    return data;
  }, [approvedBookings]);

  const totalRevenue = approvedBookings.reduce((sum, b) => {
    return sum + (b.pricePaid || 0); // we use pricePaid if available
  }, 0);

  const stats = [
    { icon: DollarSign, label: 'Chiffre d\'affaires', value: `€${totalRevenue}`, change: '', color: 'from-green-500 to-emerald-600' },
    { icon: Calendar, label: 'Réservations Totales', value: filteredBookings.length.toString(), change: '', color: 'from-blue-500 to-cyan-600' },
    { icon: Users, label: 'Clients Actifs', value: new Set(filteredBookings.map(b => b.clientEmail)).size.toString(), change: '', color: 'from-purple-500 to-pink-600' },
    { icon: Scissors, label: 'Services Réalisés', value: approvedBookings.length.toString(), change: '', color: 'from-[#D4AF37] to-[#FFD700]' },
  ];

  const pendingBookings = bookings.filter(b => b.status === 'pending');

  const barberPerformance = barbers.map(barber => {
    const barberBookings = approvedBookings.filter(b => b.barberId === barber.id);
    const barberRevenue = barberBookings.reduce((sum, b) => {
      return sum + (b.pricePaid || 0);
    }, 0);
    return {
      name: barber.name,
      bookings: barberBookings.length,
      revenue: `€${barberRevenue}`,
      rating: barber.rating
    };
  });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleApproveBooking = (id: string) => {
    if (confirm("Le client a-t-il payé ? Cliquez sur OK pour approuver.")) {
      updateBookingStatus(id, 'approved');
      toast.success('Réservation approuvée !');
    }
  };

  const handleRejectBooking = (id: string) => {
    updateBookingStatus(id, 'rejected');
    toast.error('Réservation rejetée');
  };

  const renderDateFilterSelector = () => (
    <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
      <div className="flex bg-[#141414] rounded-lg p-1 border border-[#D4AF37]/20 overflow-x-auto max-w-full">
        <button type="button" onClick={() => setDateFilter('all')} className={`px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${dateFilter === 'all' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/60 hover:text-white'}`}>Tout</button>
        <button type="button" onClick={() => setDateFilter('day')} className={`px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${dateFilter === 'day' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/60 hover:text-white'}`}>Auj.</button>
        <button type="button" onClick={() => setDateFilter('week')} className={`px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${dateFilter === 'week' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/60 hover:text-white'}`}>Sem.</button>
        <button type="button" onClick={() => setDateFilter('month')} className={`px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${dateFilter === 'month' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/60 hover:text-white'}`}>Mois</button>
        <button type="button" onClick={() => setDateFilter('custom')} className={`px-3 py-1.5 text-sm rounded-md transition-all whitespace-nowrap ${dateFilter === 'custom' ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/60 hover:text-white'}`}>Perso.</button>
      </div>
      {dateFilter === 'custom' && (
        <div className="flex items-center gap-2">
          <input 
            type="date" 
            value={customDateRange.start}
            onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="bg-[#141414] border border-[#D4AF37]/20 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D4AF37] w-[120px]" 
          />
          <span className="text-white/40">-</span>
          <input 
            type="date" 
            value={customDateRange.end}
            onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="bg-[#141414] border border-[#D4AF37]/20 text-white text-sm rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#D4AF37] w-[120px]" 
          />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
            {businessInfo.name} Admin
          </h1>
          <div className="flex items-center gap-4">
            <button className="relative p-2 hover:bg-white/10 rounded-lg transition-colors">
              <Bell className="w-5 h-5 text-white/60" />
              {pendingBookings.length > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            <div className="text-right">
              <p className="text-white">{user?.name}</p>
              <p className="text-white/40 text-sm">Administrator</p>
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

      <div className="max-w-[1600px] mx-auto px-6 py-8 pb-28 md:pb-8">
        <div className="grid lg:grid-cols-5 gap-8">
          <div className="hidden md:block lg:col-span-1 space-y-2">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Tableau de bord' },
              { id: 'attendance', icon: Clock, label: 'Pointage' },
              { id: 'bookings', icon: Calendar, label: 'Réservations' },
              { id: 'reports', icon: TrendingUp, label: 'Rapports' },
              { id: 'barbers', icon: Users, label: 'Coiffeurs' },
              { id: 'services', icon: Scissors, label: 'Services' },
              { id: 'boutique', icon: ShoppingBag, label: 'Boutique' },
              { id: 'branding', icon: ImageIcon, label: 'Branding' },
              { id: 'settings', icon: Settings, label: 'Paramètres' },
            ].map((tab) => (

              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold'
                    : 'text-white/60 hover:bg-white/5'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="lg:col-span-4">
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h2 className="text-3xl font-bold text-white">Business Overview</h2>
                  {renderDateFilterSelector()}
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {stats.map((stat, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                    >
                      <div className={`inline-flex p-3 rounded-xl bg-gradient-to-r ${stat.color} mb-4`}>
                        <stat.icon className="w-6 h-6 text-white" />
                      </div>
                      <p className="text-white/60 text-sm mb-1">{stat.label}</p>
                      <p className="text-3xl font-bold text-white mb-2">{stat.value}</p>
                      <p className="text-green-400 text-sm flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        {stat.change}
                      </p>
                    </motion.div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                  >
                    <h3 className="text-xl font-bold text-white mb-6">Revenue Trend</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={revenueData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="month" stroke="#a3a3a3" />
                        <YAxis stroke="#a3a3a3" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '8px' }}
                        />
                        <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                  >
                    <h3 className="text-xl font-bold text-white mb-6">Weekly Bookings</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={bookingsData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="day" stroke="#a3a3a3" />
                        <YAxis stroke="#a3a3a3" />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '8px' }}
                        />
                        <Bar dataKey="bookings" fill="url(#goldGradient)" />
                        <defs>
                          <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FFD700" />
                            <stop offset="100%" stopColor="#D4AF37" />
                          </linearGradient>
                        </defs>
                      </BarChart>
                    </ResponsiveContainer>
                  </motion.div>
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                >
                  <h3 className="text-xl font-bold text-white mb-6">Barber Performance</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#D4AF37]/20">
                          <th className="text-left text-white/60 pb-4">Barber</th>
                          <th className="text-left text-white/60 pb-4">Bookings</th>
                          <th className="text-left text-white/60 pb-4">Revenue</th>
                          <th className="text-left text-white/60 pb-4">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {barberPerformance.map((barber, index) => (
                          <tr key={index} className="border-b border-white/5">
                            <td className="py-4 text-white">{barber.name}</td>
                            <td className="py-4 text-white/60">{barber.bookings}</td>
                            <td className="py-4 text-[#D4AF37]">{barber.revenue}</td>
                            <td className="py-4 text-white/60">{barber.rating} ⭐</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </div>
            )}

            {activeTab === 'bookings' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold text-white">Gestion des Réservations</h2>
                  <button 
                    onClick={() => {
                      const clientName = prompt('Nom du client');
                      const clientPhone = prompt('Téléphone du client');
                      const serviceName = prompt('Nom du service (exact)');
                      const date = prompt('Date (AAAA-MM-JJ)', new Date().toISOString().split('T')[0]);
                      const time = prompt('Heure (HH:MM)');
                      
                      if (clientName && clientPhone && serviceName && date && time) {
                        const srv = services.find(s => s.name.toLowerCase() === serviceName.toLowerCase());
                        addBooking({
                          clientName,
                          clientEmail: 'N/A',
                          clientPhone,
                          serviceId: srv ? srv.id : services[0]?.id || '',
                          barberId: 'any',
                          date,
                          time
                        });
                        toast.success('Réservation ajoutée !');
                      }
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter une Réservation
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-white">En attente d'approbation ({pendingBookings.length})</h3>
                  {pendingBookings.length === 0 ? (
                    <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                      <p className="text-white/40">Aucune réservation en attente</p>
                    </div>
                  ) : (
                    pendingBookings.map((booking) => (
                      <motion.div
                        key={booking.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-xl font-bold text-white mb-2">{booking.clientName}</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-white/60 text-sm">
                              <span>Service: {services.find(s => s.id === booking.serviceId)?.name || 'N/A'}</span>
                              <span>Coiffeur: {booking.barberId === 'any' ? 'N\'importe quel coiffeur' : (barbers.find(b => b.id === booking.barberId)?.name || 'N/A')}</span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                {booking.date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {booking.time}
                              </span>
                            </div>
                            <div className="mt-2 flex gap-4 text-xs text-[#D4AF37]/60">
                              <span>{booking.clientEmail}</span>
                              <span>{booking.clientPhone}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <a 
                              href={`tel:${booking.clientPhone}`}
                              className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors flex items-center gap-2 font-bold"
                            >
                              <Phone className="w-4 h-4" />
                              Appeler
                            </a>
                            <button 
                              onClick={() => {
                                const newDate = prompt('Nouvelle date (AAAA-MM-JJ)', booking.date);
                                const newTime = prompt('Nouvelle heure', booking.time);
                                if (newDate && newTime) {
                                  updateBooking(booking.id, { date: newDate, time: newTime });
                                  toast.success('Réservation modifiée !');
                                }
                              }}
                              className="px-4 py-2 bg-white/5 text-[#D4AF37] rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 font-bold"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleApproveBooking(booking.id)}
                              className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-2 font-bold"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => handleRejectBooking(booking.id)}
                              className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors flex items-center gap-2 font-bold"
                            >
                              <X className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => {
                                if (confirm('Supprimer cette réservation définitivement ?')) deleteBooking(booking.id);
                              }}
                              className="px-4 py-2 bg-white/5 text-red-500 rounded-lg hover:bg-white/10 transition-colors flex items-center gap-2 font-bold"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold text-white">Rapports Avancés</h2>
                    <p className="text-white/60">Analyse détaillée des performances et de la finance.</p>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <select 
                      value={barberFilter}
                      onChange={(e) => setBarberFilter(e.target.value)}
                      className="px-4 py-2 bg-[#141414] border border-[#D4AF37]/20 rounded-lg text-white"
                    >
                      <option value="all">Tous les Coiffeurs</option>
                      {barbers.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    {renderDateFilterSelector()}
                  </div>
                </div>

                <div className="grid md:grid-cols-4 gap-6">
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <p className="text-white/60 text-xs mb-1 uppercase">Revenu Global</p>
                    <p className="text-2xl font-bold text-white">€{(
                      filteredBookings.reduce((sum, b) => sum + (b.pricePaid || 0), 0) + 
                      filteredSales.reduce((sum, s) => sum + s.sellPrice * s.quantity, 0)
                    ).toFixed(2)}</p>
                  </div>
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <p className="text-white/60 text-xs mb-1 uppercase">Commissions Coiffeurs</p>
                    <p className="text-2xl font-bold text-[#D4AF37]">€{
                      filteredSettlements.reduce((sum, s) => sum + s.earnings, 0).toFixed(2)
                    }</p>
                  </div>
                  <div className="bg-[#141414] rounded-2xl border border-red-500/20 p-6">
                    <p className="text-white/60 text-xs mb-1 uppercase">Soldes Impayés</p>
                    <p className="text-2xl font-bold text-red-400">€{
                      filteredSettlements.reduce((sum, s) => sum + s.balance, 0).toFixed(2)
                    }</p>
                  </div>
                  <div className="bg-[#141414] rounded-2xl border border-green-500/20 p-6">
                    <p className="text-white/60 text-xs mb-1 uppercase">Taux Ponctualité</p>
                    <p className="text-2xl font-bold text-green-400">
                      {filteredAttendance.length > 0 
                        ? Math.round((filteredAttendance.filter(a => a.status === 'on-time').length / filteredAttendance.length) * 100) 
                        : 100}%
                    </p>
                  </div>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Financial History */}
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-[#D4AF37]" />
                      Clôtures de caisse (Barbiers)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="text-white/40 text-xs border-b border-white/10">
                          <tr>
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Barbier</th>
                            <th className="pb-2">Gagné</th>
                            <th className="pb-2">Dû</th>
                            <th className="pb-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="text-white/80 text-sm">
                          {filteredSettlements.map(s => (
                            <tr key={s.id} className="border-b border-white/5">
                              <td className="py-3">{s.date}</td>
                              <td className="py-3 font-bold">{barbers.find(b => b.id === s.barberId)?.name}</td>
                              <td className="py-3">€{s.earnings.toFixed(2)}</td>
                              <td className="py-3 text-red-400">€{s.balance.toFixed(2)}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${s.status === 'settled' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {s.status === 'settled' ? 'RÉGLÉ' : 'DÛ'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredSettlements.length === 0 && (
                            <tr><td colSpan={5} className="py-8 text-center opacity-40 italic">Aucune clôture enregistrée.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Attendance Intelligence */}
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#D4AF37]" />
                      Retards & Présences
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="text-white/40 text-xs border-b border-white/10">
                          <tr>
                            <th className="pb-2">Date</th>
                            <th className="pb-2">Barbier</th>
                            <th className="pb-2">Arrivée</th>
                            <th className="pb-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="text-white/80 text-sm">
                          {filteredAttendance.map(a => (
                            <tr key={a.id} className="border-b border-white/5">
                              <td className="py-3">{a.date}</td>
                              <td className="py-3 font-bold">{barbers.find(b => b.id === a.barberId)?.name}</td>
                              <td className="py-3">{a.checkInTime}</td>
                              <td className="py-3">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] ${a.status === 'on-time' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                  {a.status === 'on-time' ? 'À l\'heure' : 'En retard'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {filteredAttendance.length === 0 && (
                            <tr><td colSpan={4} className="py-8 text-center opacity-40 italic">Aucun pointage enregistré.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Performance Charts */}
                <div className="grid lg:grid-cols-2 gap-6">
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <h3 className="text-xl font-bold text-white mb-6">Chiffre d'affaires (Services)</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={filteredBookings.reduce((acc: any[], b) => {
                        const day = b.date.split('-')[2];
                        const existing = acc.find(x => x.day === day);
                        if (existing) existing.revenue += (b.pricePaid || 0);
                        else acc.push({ day, revenue: (b.pricePaid || 0) });
                        return acc;
                      }, []).sort((a, b) => parseInt(a.day) - parseInt(b.day))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="day" stroke="#a3a3a3" />
                        <YAxis stroke="#a3a3a3" />
                        <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '8px' }} />
                        <Line type="monotone" dataKey="revenue" stroke="#D4AF37" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <h3 className="text-xl font-bold text-white mb-6">Ventes Produits</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={filteredSales.reduce((acc: any[], s) => {
                        const day = s.date.split('-')[2];
                        const existing = acc.find(x => x.day === day);
                        if (existing) existing.sales += (s.sellPrice * s.quantity);
                        else acc.push({ day, sales: (s.sellPrice * s.quantity) });
                        return acc;
                      }, []).sort((a, b) => parseInt(a.day) - parseInt(b.day))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
                        <XAxis dataKey="day" stroke="#a3a3a3" />
                        <YAxis stroke="#a3a3a3" />
                        <Tooltip contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid rgba(212, 175, 55, 0.2)', borderRadius: '8px' }} />
                        <Bar dataKey="sales" fill="#D4AF37" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'services' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold text-white">Gestion des Services</h2>
                  <button 
                    onClick={() => {
                      setEditingService(null);
                      setServiceModalOpen(true);
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter un Service
                  </button>
                </div>

                <div className="space-y-4">
                  {services.map((service) => (
                    <motion.div
                      key={service.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <img src={service.image} alt={service.name} className="w-16 h-16 rounded-lg object-cover border border-[#D4AF37]/20" />
                          <div>
                            <h3 className="text-xl font-bold text-white mb-1">{service.name}</h3>
                            <div className="flex items-center gap-6 text-white/60">
                              <span className="text-[#D4AF37] font-bold">{service.price}</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                {service.duration}
                              </span>
                              <p className="text-sm truncate max-w-md">{service.description}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingService(service);
                              setServiceModalOpen(true);
                            }}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Edit className="w-5 h-5 text-[#D4AF37]" />
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm('Supprimer ce service ?')) deleteService(service.id);
                            }}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-5 h-5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'barbers' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-3xl font-bold text-white">Gestion des Coiffeurs</h2>
                    <p className="text-white/60">Gérez les comptes, les commissions et les soldes.</p>
                  </div>
                  <button 
                    onClick={() => {
                      setEditingBarber(null);
                      setBarberModalOpen(true);
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Nouveau Coiffeur
                  </button>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  {barbers.map((barber) => {
                    const balance = (settlements || [])
                      .filter(s => s.barberId === barber.id)
                      .reduce((sum, s) => sum + s.balance, 0);
                    
                    return (
                      <motion.div
                        key={barber.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border ${barber.archived ? 'border-red-500/20 grayscale' : 'border-[#D4AF37]/20'} p-6`}
                      >
                        <div className="flex items-start gap-4">
                          <img src={barber.image} alt={barber.name} className="w-20 h-20 rounded-xl object-cover border border-[#D4AF37]/20" />
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="text-xl font-bold text-white">{barber.name}</h3>
                                <p className="text-[#D4AF37] text-sm">{barber.specialty}</p>
                              </div>
                              <div className="flex flex-col items-end gap-2">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${barber.archived ? 'bg-red-500/20 text-red-400' : 'bg-green-500/20 text-green-400'}`}>
                                  {barber.archived ? 'ARCHIVÉ' : 'ACTIF'}
                                </span>
                                {barber.status && (
                                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                                    barber.status === 'available' ? 'bg-green-500/20 text-green-400' :
                                    barber.status === 'busy' ? 'bg-red-500/20 text-red-400' :
                                    barber.status === 'break' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-400'
                                  }`}>
                                    {barber.status.toUpperCase()}
                                  </span>
                                )}
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mt-4">
                              <div className="space-y-1">
                                <p className="text-white/40 text-xs flex items-center gap-1"><Mail className="w-3 h-3" /> Email</p>
                                <p className="text-white text-sm truncate">{barber.email || barber.username + '@shop.com'}</p>
                              </div>
                              <div className="space-y-1">
                                <p className="text-white/40 text-xs flex items-center gap-1"><Lock className="w-3 h-3" /> Login</p>
                                <p className="text-white text-sm">{barber.username}</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-6 grid grid-cols-3 gap-4 pt-6 border-t border-white/5">
                          <div>
                            <p className="text-white/40 text-[10px] uppercase">Commission</p>
                            <p className="text-white font-bold">{barber.commission || 50}%</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-[10px] uppercase">Station</p>
                            <p className="text-white font-bold">{barber.station || 'N/A'}</p>
                          </div>
                          <div>
                            <p className="text-white/40 text-[10px] uppercase">Balance</p>
                            <p className={`font-bold ${balance > 0 ? 'text-red-400' : 'text-green-400'}`}>€{balance.toFixed(2)}</p>
                          </div>
                        </div>

                        <div className="mt-6 flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingBarber(barber);
                              setBarberModalOpen(true);
                            }}
                            className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all flex justify-center items-center gap-2 text-sm"
                          >
                            <Edit className="w-4 h-4 text-[#D4AF37]" /> Modifier
                          </button>
                          
                          <button 
                            onClick={() => {
                              if (confirm('Réinitialiser la balance à 0€ ?')) resetBarberBalance(barber.id);
                            }}
                            className="flex-1 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all flex justify-center items-center gap-2 text-sm"
                            title="Réinitialiser Balance"
                          >
                            <Wallet className="w-4 h-4 text-green-400" /> Solde
                          </button>

                          <button 
                            onClick={() => {
                              updateBarber(barber.id, { archived: !barber.archived });
                              toast.info(barber.archived ? 'Coiffeur réactivé' : 'Coiffeur archivé');
                            }}
                            className={`p-2 rounded-lg transition-all ${barber.archived ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-red-400'}`}
                            title={barber.archived ? "Désarchiver" : "Archiver"}
                          >
                            <Archive className="w-5 h-5" />
                          </button>

                          <button 
                            onClick={() => {
                              if (confirm('Supprimer définitivement ce compte ?')) deleteBarber(barber.id);
                            }}
                            className="p-2 bg-white/5 text-red-500 rounded-lg hover:bg-red-500/20 transition-all"
                            title="Supprimer"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'gallery' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold text-white">Gestion de la Galerie</h2>
                  <button 
                    onClick={() => {
                      const url = prompt('URL de l\'image');
                      if (url) {
                        addToGallery(url);
                        toast.success('Image ajoutée !');
                      }
                    }}
                    className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter une Image
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {gallery.map((img, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative group aspect-square rounded-2xl overflow-hidden border border-[#D4AF37]/20"
                    >
                      <img src={img} alt={`Gallery ${index}`} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => {
                            if (confirm('Supprimer cette image ?')) removeFromGallery(img);
                          }}
                          className="p-3 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500/40 transition-colors"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'boutique' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-3xl font-bold text-white">Gestion de la Boutique</h2>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => {
                        const productId = prompt('ID du produit à vendre (voir liste ci-dessous, ex: 1, 2) :');
                        const qtyStr = prompt('Quantité :');
                        if (productId && qtyStr) {
                          const prod = products.find(p => p.id === productId);
                          if (prod) {
                            addSale({
                              productId: prod.id,
                              sellerId: 'admin',
                              quantity: parseInt(qtyStr) || 1,
                              buyPrice: prod.buyPrice,
                              sellPrice: prod.sellPrice
                            });
                            toast.success('Vente enregistrée !');
                          } else {
                            toast.error('Produit introuvable.');
                          }
                        }
                      }}
                      className="px-6 py-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all font-bold flex items-center gap-2"
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Vendre
                    </button>
                    <button 
                      onClick={() => {
                        setEditingProduct(null);
                        setProductModalOpen(true);
                      }}
                      className="px-6 py-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter Produit
                    </button>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 overflow-hidden"
                    >
                      <div className="h-40 bg-white/5 flex items-center justify-center p-4">
                        <img src={product.image} alt={product.name} className="max-h-full object-contain" />
                      </div>
                      <div className="p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="text-lg font-bold text-white">{product.name}</h3>
                            <span className="text-xs text-white/40">ID: {product.id}</span>
                          </div>
                          <span className="text-[#D4AF37] font-bold">€{product.sellPrice}</span>
                        </div>
                        <div className="flex justify-between text-sm text-white/60 mb-4 border-t border-white/10 pt-2">
                          <span>Achat: €{product.buyPrice}</span>
                          <span className="text-green-400">Marge: €{(product.sellPrice - product.buyPrice).toFixed(2)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setEditingProduct(product);
                              setProductModalOpen(true);
                            }}
                            className="flex-1 py-2 bg-white/5 text-[#D4AF37] rounded-lg hover:bg-white/10 transition-colors flex justify-center"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => {
                              if (confirm('Supprimer ce produit ?')) deleteProduct(product.id);
                            }}
                            className="flex-1 py-2 bg-white/5 text-red-500 rounded-lg hover:bg-white/10 transition-colors flex justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'attendance' && (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h2 className="text-3xl font-bold text-white">Pointage & Présence</h2>
                  <div className="flex bg-[#141414] rounded-lg p-1 border border-[#D4AF37]/20">
                    <button className="px-4 py-2 text-sm bg-[#D4AF37] text-black font-bold rounded-md">Aujourd'hui</button>
                    <button className="px-4 py-2 text-sm text-white/60 hover:text-white">Historique</button>
                  </div>
                </div>

                <div className="grid md:grid-cols-3 gap-6 mb-6">
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <p className="text-white/60 text-sm mb-1">Présence Totale</p>
                    <p className="text-3xl font-bold text-white">
                      {(attendance || []).filter(a => a.date === new Date().toISOString().split('T')[0]).length} / {barbers.length}
                    </p>
                  </div>
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <p className="text-white/60 text-sm mb-1">Retards aujourd'hui</p>
                    <p className="text-3xl font-bold text-red-400">
                      {(attendance || []).filter(a => a.date === new Date().toISOString().split('T')[0] && a.status === 'late').length}
                    </p>
                  </div>
                  <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6">
                    <p className="text-white/60 text-sm mb-1">Taux de ponctualité</p>
                    <p className="text-3xl font-bold text-green-400">
                      {(attendance || []).length > 0 
                        ? Math.round(((attendance || []).filter(a => a.status === 'on-time').length / (attendance || []).length) * 100) 
                        : 100}%
                    </p>
                  </div>
                </div>

                <div className="grid lg:grid-cols-3 gap-6">
                  {/* Left: Live Feed */}
                  <div className="lg:col-span-2 space-y-6">
                    <div className="bg-[#141414] rounded-2xl border border-[#D4AF37]/20 p-6 overflow-hidden">
                      <h3 className="text-xl font-bold text-white mb-4">Présences du jour</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="text-left text-white/40 border-b border-white/10">
                              <th className="pb-4 font-medium">Barbier</th>
                              <th className="pb-4 font-medium">Station</th>
                              <th className="pb-4 font-medium">Arrivée</th>
                              <th className="pb-4 font-medium">Statut</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {(attendance || [])
                              .filter(a => a.date === new Date().toISOString().split('T')[0])
                              .map((record) => {
                                const barber = barbers.find(b => b.id === record.barberId);
                                return (
                                  <tr key={record.id} className="text-white">
                                    <td className="py-4">
                                      <div className="flex items-center gap-3">
                                        <img src={barber?.image} alt="" className="w-8 h-8 rounded-full object-cover" />
                                        <span>{barber?.name}</span>
                                      </div>
                                    </td>
                                    <td className="py-4">{record.station}</td>
                                    <td className="py-4">{record.checkInTime}</td>
                                    <td className="py-4">
                                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                                        record.status === 'on-time' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                      }`}>
                                        {record.status === 'on-time' ? 'À l\'heure' : 'En retard'}
                                      </span>
                                    </td>
                                  </tr>
                                );
                              })}
                             {(attendance || []).filter(a => a.date === new Date().toISOString().split('T')[0]).length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-white/40 italic">
                                  Aucun pointage enregistré pour le moment.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Right: QR Code Generation */}
                  <div className="space-y-6">
                    <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] rounded-2xl border border-[#D4AF37]/30 p-6 shadow-2xl">
                      <h3 className="text-xl font-bold text-[#D4AF37] mb-4">Générer QR Codes</h3>
                      <p className="text-white/60 text-sm mb-6">
                        Imprimez ces codes et placez-les sur chaque station de travail.
                      </p>
                      
                      <div className="space-y-4">
                        {barbers.map(barber => (
                          <div key={barber.id} className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-[#D4AF37]/40 transition-all">
                            <div className="flex items-center justify-between mb-4">
                              <div>
                                <p className="text-white font-bold">{barber.name}</p>
                                <p className="text-white/40 text-xs">Station {barber.station || 'N/A'}</p>
                              </div>
                              <button 
                                onClick={() => window.print()} 
                                className="p-2 bg-[#D4AF37]/10 text-[#D4AF37] rounded-lg hover:bg-[#D4AF37]/20"
                                title="Imprimer"
                              >
                                <ImageIcon className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex justify-center bg-white p-3 rounded-lg">
                              <QRCodeCanvas 
                                value={JSON.stringify({ 
                                  barberId: barber.id, 
                                  station: barber.station,
                                  type: 'check-in'
                                })}
                                size={120}
                                level="H"
                                includeMargin={true}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'branding' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-white">Personnalisation du Site</h2>

                {/* Hero Section */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6">
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-[#D4AF37]" />Hero & Logo</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Image Hero (fond)</label>
                      {businessInfo.heroImage && <img src={businessInfo.heroImage} className="w-full h-32 object-cover rounded-lg mb-2 opacity-60" />}
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) { const url = await handleImageUpload(file); updateBusinessInfo({ heroImage: url }); toast.success('Image hero mise à jour !'); }
                      }} className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#D4AF37] file:text-black" />
                    </div>
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Logo Navbar</label>
                      {businessInfo.logo && <img src={businessInfo.logo} className="h-16 object-contain mb-2 bg-white/5 p-2 rounded-lg" />}
                      <input type="file" accept="image/*" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) { const url = await handleImageUpload(file); updateBusinessInfo({ logo: url }); toast.success('Logo mis à jour !'); }
                      }} className="w-full text-sm text-white/60 file:mr-3 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#D4AF37] file:text-black" />
                      {businessInfo.logo && <button onClick={() => { updateBusinessInfo({ logo: '' }); toast.success('Logo réinitialisé'); }} className="mt-2 text-xs text-red-400 hover:text-red-300">Supprimer le logo</button>}
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4 mt-6">
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Nom du salon (Navbar)</label>
                      <input defaultValue={businessInfo.name || 'Elite Cuts'} onBlur={(e) => updateBusinessInfo({ name: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Titre principal (Hero)</label>
                      <input defaultValue={businessInfo.heroTitle || 'Soins Premium'} onBlur={(e) => updateBusinessInfo({ heroTitle: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                    </div>
                    <div>
                      <label className="block text-white/60 text-sm mb-2">Texte du bouton</label>
                      <input defaultValue={businessInfo.heroButtonText || 'Prendre Rendez-vous'} onBlur={(e) => updateBusinessInfo({ heroButtonText: e.target.value })} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block text-white/60 text-sm mb-2">Sous-titre</label>
                      <textarea defaultValue={businessInfo.heroSubtitle} onBlur={(e) => updateBusinessInfo({ heroSubtitle: e.target.value })} rows={2} className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none text-sm resize-none" />
                    </div>
                  </div>
                </motion.div>

                {/* Stats Section */}
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6">
                  <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-[#D4AF37]" />Statistiques</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    {(businessInfo.stats || [
                      { id: 'experience', label: "Années d'expérience", value: '15+', enabled: true },
                      { id: 'clients', label: 'Clients Satisfaits', value: '10K+', enabled: true },
                      { id: 'services', label: 'Services Réalisés', value: '50K+', enabled: true },
                      { id: 'rating', label: 'Note des Clients', value: '4.9', enabled: true },
                    ]).map((stat, idx) => (
                      <div key={stat.id} className="p-4 bg-white/5 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-white font-medium text-sm">{stat.label}</span>
                          <button
                            onClick={() => {
                              const newStats = [...(businessInfo.stats || [])];
                              newStats[idx] = { ...stat, enabled: !stat.enabled };
                              updateBusinessInfo({ stats: newStats });
                            }}
                            className={`relative w-12 h-6 rounded-full transition-colors ${stat.enabled ? 'bg-[#D4AF37]' : 'bg-white/10'}`}
                          >
                            <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow ${stat.enabled ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-white/40 text-[10px] uppercase tracking-wider">Valeur</label>
                            <input
                              defaultValue={stat.value}
                              onBlur={(e) => {
                                const newStats = [...(businessInfo.stats || [])];
                                newStats[idx] = { ...stat, value: e.target.value };
                                updateBusinessInfo({ stats: newStats });
                              }}
                              className="w-full bg-transparent border-b border-white/10 text-white text-lg font-bold focus:outline-none focus:border-[#D4AF37] py-1"
                            />
                          </div>
                          <div>
                            <label className="text-white/40 text-[10px] uppercase tracking-wider">Label</label>
                            <input
                              defaultValue={stat.label}
                              onBlur={(e) => {
                                const newStats = [...(businessInfo.stats || [])];
                                newStats[idx] = { ...stat, label: e.target.value };
                                updateBusinessInfo({ stats: newStats });
                              }}
                              className="w-full bg-transparent border-b border-white/10 text-white/60 text-sm focus:outline-none focus:border-[#D4AF37] py-1"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <h2 className="text-3xl font-bold text-white">Paramètres de l'entreprise</h2>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/20 p-6"
                >
                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      updateBusinessInfo({
                        name: formData.get('name') as string,
                        phone: formData.get('phone') as string,
                        address: formData.get('address') as string,
                        adminEmail: formData.get('adminEmail') as string,
                        adminPassword: formData.get('adminPassword') as string,
                        hours: {
                          weekdays: formData.get('weekdays') as string,
                          weekends: formData.get('weekends') as string,
                        }
                      });
                      toast.success('Paramètres mis à jour !');
                    }}
                    className="space-y-6"
                  >
                    <div>
                      <h3 className="text-xl font-bold text-white mb-4">Informations de l'entreprise</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-white/60 mb-2">Nom de l'entreprise</label>
                          <input
                            name="name"
                            type="text"
                            defaultValue={businessInfo.name}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-white/60 mb-2">Numéro de téléphone</label>
                          <input
                            name="phone"
                            type="tel"
                            defaultValue={businessInfo.phone}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-white/60 mb-2">Adresse</label>
                          <input
                            name="address"
                            type="text"
                            defaultValue={businessInfo.address}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold text-white mb-4">Heures d'ouverture</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-white/60 mb-2">En semaine</label>
                          <input
                            name="weekdays"
                            type="text"
                            defaultValue={businessInfo.hours.weekdays}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-white/60 mb-2">Week-end</label>
                          <input
                            name="weekends"
                            type="text"
                            defaultValue={businessInfo.hours.weekends}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold text-white mb-4">Identifiants d'Administration</h3>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-white/60 mb-2">Email Admin</label>
                          <input
                            name="adminEmail"
                            type="email"
                            defaultValue={businessInfo.adminEmail || 'admin@barbershop.com'}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-white/60 mb-2">Mot de passe Admin</label>
                          <input
                            name="adminPassword"
                            type="text"
                            defaultValue={businessInfo.adminPassword || 'admin123'}
                            className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white"
                          />
                        </div>
                      </div>
                    </div>

                    <button 
                      type="submit"
                      className="w-full px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all font-bold"
                    >
                      Enregistrer les modifications
                    </button>
                  </form>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6"
                >
                  <h3 className="text-xl font-bold text-red-500 mb-2 flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Actions de Danger
                  </h3>
                  <p className="text-white/60 text-sm mb-6">Ces actions sont irréversibles. Soyez prudent.</p>
                  <div className="flex flex-wrap gap-4">
                    <button
                      onClick={() => {
                        if (confirm('ATTENTION: Voulez-vous vraiment réinitialiser TOUTES les balances de TOUS les coiffeurs à 0€ ?')) {
                          barbers.forEach(b => resetBarberBalance(b.id));
                          toast.error('Toutes les balances ont été réinitialisées.');
                        }
                      }}
                      className="px-6 py-3 bg-red-600/20 border border-red-500/50 hover:bg-red-600 text-white font-bold rounded-xl transition-all active:scale-95 flex items-center gap-2"
                    >
                      Réinitialiser les balances
                    </button>

                    <button
                      onClick={async () => {
                        if (confirm('Voulez-vous remplir la base de données avec les données par défaut (Services, Coiffeurs, Produits) ?')) {
                          await seedDatabase();
                          toast.success('Base de données initialisée !');
                        }
                      }}
                      className="px-6 py-3 bg-[#D4AF37]/20 border border-[#D4AF37]/50 hover:bg-[#D4AF37] hover:text-black text-[#D4AF37] font-bold rounded-xl transition-all active:scale-95 flex items-center gap-2"
                    >
                      Initialiser avec les données par défaut
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-[#D4AF37]/20 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide z-40">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
          { id: 'attendance', icon: Clock, label: 'Pointage' },
          { id: 'bookings', icon: Calendar, label: 'Réservations' },
          { id: 'reports', icon: TrendingUp, label: 'Rapports' },
          { id: 'boutique', icon: ShoppingBag, label: 'Boutique' },
          { id: 'barbers', icon: Users, label: 'Coiffeurs' },
          { id: 'services', icon: Scissors, label: 'Services' },
          { id: 'branding', icon: ImageIcon, label: 'Branding' },
          { id: 'settings', icon: Settings, label: 'Paramètres' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`min-w-[80px] flex-1 snap-center flex flex-col items-center justify-center p-3 gap-1 transition-colors active:scale-95 ${
              activeTab === tab.id
                ? 'text-[#D4AF37]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-6 h-6" />
            <span className="text-[10px] font-medium truncate w-full text-center">{tab.label}</span>
          </button>
        ))}
      </div>
      {/* Modals for Barbers, Services, Products */}
      <AnimatePresence>
        {barberModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/30 p-8 max-h-[90vh] overflow-y-auto"
            >
              <button onClick={() => setBarberModalOpen(false)} className="absolute top-4 right-4 text-white/60 hover:text-white"><X /></button>
              <h2 className="text-2xl font-bold text-white mb-6">{editingBarber ? 'Modifier Coiffeur' : 'Nouveau Coiffeur'}</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const file = (e.currentTarget.elements.namedItem('image') as HTMLInputElement).files?.[0];
                let imageUrl = editingBarber?.image || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=300&fit=crop';
                
                if (file && file.size > 0) imageUrl = await handleImageUpload(file);
                
                const data = {
                  name: formData.get('name') as string,
                  specialty: formData.get('specialty') as string,
                  username: formData.get('username') as string,
                  commission: parseInt(formData.get('commission') as string) || 50,
                  station: formData.get('station') as string,
                  image: imageUrl
                };
                
                if (editingBarber) {
                  await updateBarber(editingBarber.id, data);
                  toast.success('Coiffeur mis à jour');
                } else {
                  await addBarber({ ...data, password: 'password123', experience: '5 ans', rating: 5, archived: false });
                  toast.success('Coiffeur ajouté');
                }
                setBarberModalOpen(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-white/60 text-sm mb-1">Nom complet</label>
                  <input name="name" defaultValue={editingBarber?.name} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Spécialité</label>
                  <input name="specialty" defaultValue={editingBarber?.specialty} className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/60 text-sm mb-1">Username</label>
                    <input name="username" defaultValue={editingBarber?.username} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-1">Commission %</label>
                    <input name="commission" type="number" defaultValue={editingBarber?.commission || 50} className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Station</label>
                  <input name="station" defaultValue={editingBarber?.station} className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Photo de profil</label>
                  <input name="image" type="file" accept="image/*" className="w-full text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#D4AF37] file:text-black hover:file:bg-[#FFD700]" />
                </div>
                <button type="submit" className="w-full py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold rounded-lg mt-4 shadow-lg shadow-[#D4AF37]/20 hover:scale-[1.02] transition-transform">
                  Enregistrer
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {serviceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/30 p-8"
            >
              <button onClick={() => setServiceModalOpen(false)} className="absolute top-4 right-4 text-white/60 hover:text-white"><X /></button>
              <h2 className="text-2xl font-bold text-white mb-6">{editingService ? 'Modifier Service' : 'Nouveau Service'}</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const file = (e.currentTarget.elements.namedItem('image') as HTMLInputElement).files?.[0];
                let imageUrl = editingService?.image || 'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&h=300&fit=crop';
                
                if (file && file.size > 0) imageUrl = await handleImageUpload(file);
                
                const data = {
                  name: formData.get('name') as string,
                  price: formData.get('price') as string,
                  duration: formData.get('duration') as string,
                  description: formData.get('description') as string,
                  image: imageUrl
                };
                
                if (editingService) {
                  await updateService(editingService.id, data);
                  toast.success('Service mis à jour');
                } else {
                  await addService(data);
                  toast.success('Service ajouté');
                }
                setServiceModalOpen(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-white/60 text-sm mb-1">Nom du service</label>
                  <input name="name" defaultValue={editingService?.name} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/60 text-sm mb-1">Prix (ex: 25€)</label>
                    <input name="price" defaultValue={editingService?.price} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-1">Durée (ex: 30 min)</label>
                    <input name="duration" defaultValue={editingService?.duration} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Description</label>
                  <textarea name="description" defaultValue={editingService?.description} className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white h-20 focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Image du service</label>
                  <input name="image" type="file" accept="image/*" className="w-full text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#D4AF37] file:text-black" />
                </div>
                <button type="submit" className="w-full py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold rounded-lg mt-4 shadow-lg shadow-[#D4AF37]/20 hover:scale-[1.02] transition-transform">
                  Enregistrer
                </button>
              </form>
            </motion.div>
          </div>
        )}

        {productModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl border border-[#D4AF37]/30 p-8"
            >
              <button onClick={() => setProductModalOpen(false)} className="absolute top-4 right-4 text-white/60 hover:text-white"><X /></button>
              <h2 className="text-2xl font-bold text-white mb-6">{editingProduct ? 'Modifier Produit' : 'Nouveau Produit'}</h2>
              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const file = (e.currentTarget.elements.namedItem('image') as HTMLInputElement).files?.[0];
                let imageUrl = editingProduct?.image || 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?w=400&h=300&fit=crop';
                
                if (file && file.size > 0) imageUrl = await handleImageUpload(file);
                
                const data = {
                  name: formData.get('name') as string,
                  buyPrice: parseFloat(formData.get('buyPrice') as string) || 0,
                  sellPrice: parseFloat(formData.get('sellPrice') as string) || 0,
                  description: formData.get('description') as string,
                  stock: parseInt(formData.get('stock') as string) || 10,
                  image: imageUrl
                };
                
                if (editingProduct) {
                  await updateProduct(editingProduct.id, data);
                  toast.success('Produit mis à jour');
                } else {
                  await addProduct(data);
                  toast.success('Produit ajouté');
                }
                setProductModalOpen(false);
              }} className="space-y-4">
                <div>
                  <label className="block text-white/60 text-sm mb-1">Nom du produit</label>
                  <input name="name" defaultValue={editingProduct?.name} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/60 text-sm mb-1">Prix Achat (€)</label>
                    <input name="buyPrice" type="number" step="0.01" defaultValue={editingProduct?.buyPrice} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-white/60 text-sm mb-1">Prix Vente (€)</label>
                    <input name="sellPrice" type="number" step="0.01" defaultValue={editingProduct?.sellPrice} required className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Stock initial</label>
                  <input name="stock" type="number" defaultValue={editingProduct?.stock || 10} className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-1">Image du produit</label>
                  <input name="image" type="file" accept="image/*" className="w-full text-sm text-white/60 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-[#D4AF37] file:text-black" />
                </div>
                <button type="submit" className="w-full py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold rounded-lg mt-4 shadow-lg shadow-[#D4AF37]/20 hover:scale-[1.02] transition-transform">
                  Enregistrer
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

