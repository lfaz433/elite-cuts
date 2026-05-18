import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
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
  Instagram,
  Facebook,
  Globe,
  Link,
  MapPin,
  AlertCircle,
  Tag,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import type { Barber, Service, Product } from '../context/BusinessContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc, addDoc } from 'firebase/firestore';
import { usePagination } from '../../hooks/usePagination';
import { PaginationBar } from '../ui/PaginationBar';
import NotificationCenter from '../ui/NotificationCenter';
import NotificationPermissionModal from '../modals/NotificationPermissionModal';

// Lazy load components
const PerformanceChart = lazy(() => import('../admin/AdminCharts').then(m => ({ default: m.PerformanceChart })));
const RevenueChart = lazy(() => import('../admin/AdminCharts').then(m => ({ default: m.RevenueChart })));
const BarberModal = lazy(() => import('../admin/BarberModal'));
const ServiceModal = lazy(() => import('../admin/ServiceModal'));
const ProductModal = lazy(() => import('../admin/ProductModal'));
const ManualBookingModal = lazy(() => import('../modals/ManualBookingModal'));
const BarberAnalytics = lazy(() => import('../admin/BarberAnalytics').then(m => ({ default: m.BarberAnalytics })));
const POSSaleModal = lazy(() => import('../modals/POSSaleModal').then(m => ({ default: m.POSSaleModal })));
import { createBarberAccount } from '../../lib/adminAuth';

// New optimized sections
const BrandingSection = lazy(() => import('../admin/BrandingSection').then(m => ({ default: m.BrandingSection })));
const AttendanceHistory = lazy(() => import('../admin/AttendanceHistory').then(m => ({ default: m.AttendanceHistory })));
const SalesReport = lazy(() => import('../admin/SalesReport').then(m => ({ default: m.SalesReport })));
const ProductManagement = lazy(() => import('../admin/ProductManagement').then(m => ({ default: m.ProductManagement })));
const FinanceReport = lazy(() => import('../admin/FinanceReport').then(m => ({ default: m.FinanceReport })));

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 400; // Smaller for faster storage
        const MAX_HEIGHT = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
        else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.5)); // Lower quality for performance
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const { 
    services, barbers, bookings, businessInfo, updateBookingStatus,
    addService, updateService, deleteService, updateBusinessInfo,
    addBarber, updateBarber, deleteBarber, addToGallery, removeFromGallery,
    updateBooking, deleteBooking, products, sales, addProduct, updateProduct,
    deleteProduct, addSale, attendance, settlements, addSettlement,
    resetBarberBalance, seedDatabase, gallery 
  } = useBusiness();
  
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState(() => {
    const path = window.location.pathname;
    const subpath = path.split('/admin/')[1];
    const allowed = ['dashboard', 'bookings', 'reports', 'barbers', 'services', 'boutique', 'gallery', 'attendance', 'branding', 'settings'];
    return (subpath && allowed.includes(subpath)) ? subpath : 'dashboard';
  });

  // Update URL subpath when activeTab changes
  useEffect(() => {
    if (activeTab === 'dashboard') {
      navigate('/admin', { replace: true });
    } else {
      navigate(`/admin/${activeTab}`, { replace: true });
    }
  }, [activeTab, navigate]);

  // Deep linking logic for highlighting and scrolling to reservations
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const highlightId = params.get('highlight');
    if (highlightId) {
      setActiveTab('bookings');
      setStatusFilter('all'); // Ensure it's visible
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

  const [dateFilter, setDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'custom'>('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [barberFilter, setBarberFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'completed' | 'rejected'>('all');
  const [isSaving, setIsSaving] = useState(false);

  const [barberModalOpen, setBarberModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isManualBookingOpen, setIsManualBookingOpen] = useState(false);
  const [posProduct, setPosProduct] = useState<any>(null);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [bookingToReject, setBookingToReject] = useState<string | null>(null);

  const triggerSuccess = (callback: () => void) => {
    return new Promise<void>((resolve) => {
      setIsSaving(false);
      
      // Use a standard but high-visibility success toast
      toast.success("DONNÉES ENREGISTRÉES AVEC SUCCÈS", {
        description: "La synchronisation avec la base de données est terminée.",
        duration: 3000,
        position: 'top-center'
      });
      
      setTimeout(() => {
        callback();
        resolve();
      }, 1000); // Close modal slightly earlier than toast disappears
    });
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    return await compressImage(file);
  };

  const isDateInRange = (dateStr: string) => {
    if (dateFilter === 'all') return true;
    if (!dateStr) return false;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const now = new Date();
    let start = new Date(0);
    let end = new Date(3000, 0, 1);
    if (dateFilter === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (dateFilter === 'week') {
      const first = now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1);
      start = new Date(now.getFullYear(), now.getMonth(), first, 0, 0, 0, 0);
      end = new Date(start.getTime()); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    } else if (dateFilter === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (dateFilter === 'custom') {
      if (customDateRange.start) start = new Date(customDateRange.start);
      if (customDateRange.end) end = new Date(customDateRange.end);
    }
    return date >= start && date <= end;
  };

  const filteredBookings = useMemo(() => bookings.filter(b => isDateInRange(b.date) && (barberFilter === 'all' || b.barberId === barberFilter)), [bookings, dateFilter, customDateRange, barberFilter]);
  const finalBookings = useMemo(() => {
    const filtered = filteredBookings.filter(b => statusFilter === 'all' || b.status === statusFilter);
    return filtered.sort((a, b) => {
      // 1. Pending
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      // 2. New (highlighted or unread)
      const aIsNew = a.unreadAdmin || highlightedIds.has(a.id);
      const bIsNew = b.unreadAdmin || highlightedIds.has(b.id);
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      // 3. Approved
      if (a.status === 'approved' && b.status !== 'approved') return -1;
      if (a.status !== 'approved' && b.status === 'approved') return 1;
      // Default: sort by date/time descending
      return new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime();
    });
  }, [filteredBookings, statusFilter, highlightedIds]);

  useEffect(() => {
    if (activeTab === 'bookings') {
      const unreadBookings = bookings.filter(b => b.unreadAdmin);
      if (unreadBookings.length > 0) {
        setHighlightedIds(prev => {
          const newSet = new Set(prev);
          unreadBookings.forEach(b => newSet.add(b.id));
          return newSet;
        });
        unreadBookings.forEach(b => {
          updateBooking(b.id, { unreadAdmin: false });
        });
      }
    }
  }, [activeTab, bookings, updateBooking]);

  // Pagination for reservations (15 per page) — must come AFTER finalBookings
  const bookingsPagination = usePagination(finalBookings, 15);
  useEffect(() => { bookingsPagination.reset(); }, [statusFilter, dateFilter, barberFilter]);
  const approvedBookings = useMemo(() => filteredBookings.filter(b => b.status === 'completed' || b.status === 'approved'), [filteredBookings]);
  const totalRevenue = useMemo(() => approvedBookings.reduce((sum, b) => sum + (b.pricePaid || 0), 0), [approvedBookings]);

  const revenueTrend = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();
    return last7Days.map(date => ({
      name: date.split('-').slice(1).join('/'),
      revenue: approvedBookings.filter(b => b.date === date).reduce((sum, b) => sum + (b.pricePaid || 0), 0)
    }));
  }, [approvedBookings]);

  const barberPerformance = useMemo(() => barbers.map(barber => ({
    name: barber.name,
    total: approvedBookings.filter(b => b.barberId === barber.id).length
  })), [barbers, approvedBookings]);

  const handleLogout = () => { logout(); navigate('/'); };

  const renderDateFilterSelector = () => (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex bg-[#141414] rounded-lg p-1 border border-[#D4AF37]/20">
        {['all', 'day', 'week', 'month', 'custom'].map(f => (
          <button key={f} onClick={() => setDateFilter(f as any)} className={`px-3 py-1.5 text-xs rounded-md transition-all ${dateFilter === f ? 'bg-[#D4AF37] text-black font-bold' : 'text-white/60 hover:text-white'}`}>
            {f === 'all' ? 'Tout' : f === 'day' ? 'Auj.' : f === 'week' ? 'Sem.' : f === 'month' ? 'Mois' : 'Perso.'}
          </button>
        ))}
      </div>
      {dateFilter === 'custom' && (
        <div className="flex items-center gap-2">
          <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-[#141414] border border-[#D4AF37]/20 text-white text-xs rounded-lg px-2 py-1.5 outline-none" />
          <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-[#141414] border border-[#D4AF37]/20 text-white text-xs rounded-lg px-2 py-1.5 outline-none" />
        </div>
      )}
    </div>
  );

  const hasUnreadBookings = bookings.some(b => b.unreadAdmin);
  const sidebarTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'bookings', icon: Calendar, label: 'Réservations', hasNotification: hasUnreadBookings },
    { id: 'reports', icon: TrendingUp, label: 'Rapports' },
    { id: 'barbers', icon: Users, label: 'Coiffeurs' },
    { id: 'services', icon: Scissors, label: 'Services' },
    { id: 'boutique', icon: ShoppingBag, label: 'Boutique' },
    { id: 'gallery', icon: ImageIcon, label: 'Portfolio' },
    { id: 'attendance', icon: Clock, label: 'Pointage' },
    { id: 'branding', icon: ImageIcon, label: 'Design' },
    { id: 'settings', icon: Settings, label: 'Paramètres' },
  ];

  return (
    <div className="min-h-screen bg-background text-white font-sans">
      <NotificationPermissionModal />
      <nav className="bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent tracking-tighter">ELITE CUTS ADMIN</h1>
          </div>
          <div className="flex items-center gap-6">
            <NotificationCenter />
            <button onClick={handleLogout} className="p-2.5 hover:bg-red-500/10 rounded-full transition-all text-white/40 hover:text-red-500"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </nav>

      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row gap-8 p-6 pb-24 md:pb-8">
        <aside className="md:w-64 space-y-1 hidden md:block">
          {sidebarTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all ${activeTab === tab.id ? 'bg-[#D4AF37] text-black font-bold shadow-2xl shadow-[#D4AF37]/30 scale-[1.02]' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}>
              <tab.icon className="w-5 h-5" />
              <span className="text-sm">{tab.label}</span>
              {tab.hasNotification && <div className="w-2 h-2 bg-red-500 rounded-full ml-auto animate-pulse" />}
            </button>
          ))}
        </aside>

        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <Suspense fallback={<div className="w-full h-96 flex items-center justify-center"><div className="w-10 h-10 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div></div>}>
              {activeTab === 'dashboard' && (
                <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <h2 className="text-4xl font-black tracking-tight">VUE D'ENSEMBLE</h2>
                    {renderDateFilterSelector()}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                      { label: 'Revenu Total', value: `€${totalRevenue.toFixed(0)}`, icon: DollarSign, color: 'text-green-400', bg: 'bg-green-500/10' },
                      { label: 'Réservations', value: filteredBookings.length, icon: Calendar, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                      { label: 'Services Prévus', value: bookings.filter(b => b.status === 'approved').length, icon: Scissors, color: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
                    ].map((stat, i) => (
                      <div key={i} className="bg-[#141414] border border-white/5 p-8 rounded-[2.5rem] hover:border-[#D4AF37]/20 transition-all group relative overflow-hidden">
                        <div className={`p-4 rounded-3xl ${stat.bg} w-fit mb-6 group-hover:scale-110 transition-transform ${stat.color}`}><stat.icon className="w-7 h-7" /></div>
                        <p className="text-white/30 text-xs font-bold uppercase tracking-widest">{stat.label}</p>
                        <p className="text-4xl font-black mt-2">{stat.value}</p>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-white/[0.02] to-transparent rounded-full -mr-16 -mt-16" />
                      </div>
                    ))}
                  </div>

                  <div className="grid lg:grid-cols-2 gap-8">
                    <div className="bg-[#141414] border border-white/5 p-8 rounded-[2.5rem]">
                      <h3 className="text-xl font-bold mb-8 flex items-center gap-2"><Users className="w-5 h-5 text-[#D4AF37]" /> Performance Coiffeurs</h3>
                      <div className="h-[300px]"><PerformanceChart data={barberPerformance} /></div>
                    </div>
                    <div className="bg-[#141414] border border-white/5 p-8 rounded-[2.5rem]">
                      <h3 className="text-xl font-bold mb-8 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-green-400" /> Tendance Revenus</h3>
                      <div className="h-[300px]"><RevenueChart data={revenueTrend} /></div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'bookings' && (
                <motion.div key="bookings" className="space-y-6">
                  <div className="flex justify-between items-center flex-wrap gap-4">
                    <h2 className="text-3xl font-black">RÉSERVATIONS</h2>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => setIsManualBookingOpen(true)} 
                        className="px-6 py-3 bg-[#D4AF37] text-black rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-xl shadow-[#D4AF37]/20 uppercase"
                      >
                        Ajouter un rendez-vous
                      </button>
                      {renderDateFilterSelector()}
                    </div>
                  </div>
                  
                  {/* Status Filters */}
                  <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
                    {[
                      { id: 'all', label: 'Toutes', count: filteredBookings.length },
                      { id: 'pending', label: 'En attente', count: filteredBookings.filter(b => b.status === 'pending').length },
                      { id: 'approved', label: 'Approuvées', count: filteredBookings.filter(b => b.status === 'approved').length },
                      { id: 'completed', label: 'Terminées', count: filteredBookings.filter(b => b.status === 'completed').length },
                      { id: 'rejected', label: 'Rejetées', count: filteredBookings.filter(b => b.status === 'rejected').length }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setStatusFilter(tab.id as any)}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                          statusFilter === tab.id
                            ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/20'
                            : 'bg-white/5 text-white/50 border-white/5 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {tab.label}
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black ${
                          statusFilter === tab.id ? 'bg-black/20 text-black' : 'bg-white/10 text-white/60'
                        }`}>
                          {tab.count}
                        </span>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-3">
                    {finalBookings.length === 0 ? (
                      <div className="text-center py-24 bg-[#141414] rounded-[2.5rem] border border-white/5 text-white/20 italic">Aucune réservation pour cette période.</div>
                    ) : (
                      <>
                        {bookingsPagination.paginated.map(booking => (
                      <div id={`booking-${booking.id}`} key={booking.id} className={`bg-[#141414] border border-white/5 p-6 rounded-[2rem] flex flex-col xl:flex-row xl:items-center justify-between gap-6 hover:border-[#D4AF37]/30 transition-all relative overflow-hidden group ${highlightedIds.has(booking.id) ? 'ring-2 ring-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.2)] bg-[#D4AF37]/5' : ''}`}>
                        {/* Background subtle glow effect */}
                        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[#D4AF37]/5 to-transparent rounded-full blur-2xl pointer-events-none group-hover:scale-150 transition-all duration-500" />
                        
                        {/* Left column: Client Details */}
                        <div className="flex gap-4 items-start min-w-[240px]">
                          <div className="w-12 h-12 bg-gradient-to-br from-[#D4AF37] to-[#FFD700] rounded-2xl flex items-center justify-center font-black text-black text-lg shadow-lg shadow-[#D4AF37]/15 shrink-0 animate-pulse">
                            {booking.clientName ? booking.clientName[0].toUpperCase() : 'C'}
                          </div>
                          <div className="space-y-1">
                            <h4 className="font-bold text-lg text-white leading-tight flex items-center gap-2">
                              {booking.clientName}
                              {(booking.unreadAdmin || highlightedIds.has(booking.id)) && (
                                <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] font-black uppercase rounded-lg shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse">Nouveau</span>
                              )}
                            </h4>
                            <div className="flex flex-col gap-1 text-xs text-white/50 font-medium">
                              {booking.clientEmail && (
                                <a href={`mailto:${booking.clientEmail}`} className="hover:text-[#D4AF37] flex items-center gap-1.5 transition-colors">
                                  <span className="lowercase">{booking.clientEmail}</span>
                                </a>
                              )}
                              {booking.clientPhone && (
                                <a href={`tel:${booking.clientPhone}`} className="hover:text-[#D4AF37] flex items-center gap-1.5 transition-colors">
                                  <span>{booking.clientPhone}</span>
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Mid-Left Column: Service details */}
                        <div className="flex flex-col gap-1 justify-center min-w-[160px]">
                          <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Service demandé</span>
                          <span className="text-[#D4AF37] text-sm font-black uppercase tracking-wider">
                            {services.find(s => s.id === booking.serviceId)?.name || 'Service Personnalisé'}
                          </span>
                          <span className="text-white/60 text-xs font-semibold">
                            {services.find(s => s.id === booking.serviceId)?.price || '€20'} • {services.find(s => s.id === booking.serviceId)?.duration || '30 min'}
                          </span>
                        </div>

                        {/* Mid-Right Column: Barber & Date Info */}
                        <div className="grid grid-cols-2 xl:flex xl:flex-row gap-6 xl:gap-8 items-center">
                          {/* Time details */}
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Date & Heure</span>
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1.5 text-xs text-white/80 font-bold uppercase">
                                <Calendar className="w-3.5 h-3.5 text-[#D4AF37]" /> {booking.date}
                              </span>
                              <span className="flex items-center gap-1.5 text-xs text-white/80 font-bold uppercase">
                                <Clock className="w-3.5 h-3.5 text-[#D4AF37]" /> {booking.time}
                              </span>
                            </div>
                          </div>

                          {/* Barber details */}
                          <div className="flex flex-col gap-1.5">
                            <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">Coiffeur assigné</span>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center font-bold text-white text-[10px] shrink-0">
                                {barbers.find(b => b.id === booking.barberId)?.name?.[0].toUpperCase() || 'C'}
                              </div>
                              <span className="text-xs text-white/80 font-bold">
                                {barbers.find(b => b.id === booking.barberId)?.name || 'Non assigné'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right column: Status & Actions */}
                        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                            {booking.clientPhone && booking.clientPhone !== 'N/A' && (
                              <a 
                                href={`tel:${booking.clientPhone}`} 
                                className="w-10 h-10 bg-white/5 text-white/80 rounded-2xl flex items-center justify-center border border-white/10 hover:bg-white/10 transition-colors shrink-0"
                                title="Appeler le client"
                              >
                                <Phone className="w-4 h-4" />
                              </a>
                            )}
                            {booking.status === 'pending' && (
                              <button 
                                onClick={() => {
                                  updateBookingStatus(booking.id, 'approved', 'admin');
                                  toast.success("RÉSERVATION APPROUVÉE");
                                }} 
                                className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded-2xl hover:bg-green-500 hover:text-white transition-all text-xs font-black uppercase tracking-wider text-center"
                              >
                                Approuver
                              </button>
                            )}
                            {(booking.status === 'pending' || booking.status === 'approved') && (
                              <button 
                                onClick={() => setBookingToReject(booking.id)} 
                                className="flex-1 sm:flex-none px-4 sm:px-5 py-2.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-2xl hover:bg-red-500 hover:text-white transition-all text-xs font-black uppercase tracking-wider text-center"
                              >
                                Rejeter
                              </button>
                            )}
                          </div>
                          
                          {/* Status Badge */}
                          <span className={`px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest text-center border shrink-0 min-w-[100px] ${
                            booking.status === 'approved' 
                              ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                              : booking.status === 'rejected' 
                              ? 'bg-red-500/10 text-red-400 border-red-500/20' 
                              : booking.status === 'completed' 
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' 
                              : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                          }`}>
                            {booking.status === 'pending' ? 'En Attente' : booking.status === 'approved' ? 'Approuvée' : booking.status === 'completed' ? 'Terminée' : 'Rejetée'}
                          </span>
                        </div>
                      </div>
                        ))}
                        <PaginationBar {...bookingsPagination} />
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab === 'barbers' && (
                <motion.div key="barbers" className="space-y-6">
                  <div className="flex justify-between items-center"><h2 className="text-3xl font-black uppercase">Coiffeurs</h2><button onClick={() => { setEditingBarber(null); setBarberModalOpen(true); }} className="px-6 py-3 bg-[#D4AF37] text-black rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-xl shadow-[#D4AF37]/20 uppercase">Nouveau Coiffeur</button></div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {barbers.map(barber => (
                      <div key={barber.id} className="bg-[#141414] border border-white/5 p-6 rounded-[2rem] flex gap-6 items-start group relative overflow-hidden hover:border-[#D4AF37]/20 transition-all">
                        <img src={barber.image || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop'} className="w-24 h-24 rounded-3xl object-cover group-hover:scale-105 transition-transform" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop'; }} />
                        <div className="flex-1 space-y-2">
                          <h4 className="text-xl font-bold">{barber.name}</h4>
                          <p className="text-[#D4AF37] text-xs font-black uppercase tracking-widest">{barber.specialty}</p>
                          
                          {/* Service Tags */}
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {barber.mainServiceId && (
                              <span className="px-2 py-0.5 bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 rounded-lg text-[10px] font-black uppercase">
                                {services.find(s => s.id === barber.mainServiceId)?.name || 'Service Principal'}
                              </span>
                            )}
                            {barber.secondaryServiceId && (
                              <span className="px-2 py-0.5 bg-white/5 text-white/50 border border-white/10 rounded-lg text-[10px] font-black uppercase">
                                {services.find(s => s.id === barber.secondaryServiceId)?.name || 'Service Secondaire'}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-white/40 pt-1">
                            <span className="font-bold">Commission: {barber.commission || 50}%</span>
                            <span className={`px-2 py-0.5 rounded-lg font-black uppercase text-[9px] ${
                              barber.status === 'available' ? 'bg-green-500/10 text-green-400' :
                              barber.status === 'busy' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'
                            }`}>{barber.status === 'available' ? 'Disponible' : barber.status === 'busy' ? 'Occupé' : 'Pause'}</span>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <button onClick={() => { setEditingBarber(barber); setBarberModalOpen(true); }} className="p-2.5 bg-white/5 rounded-xl text-white/40 hover:text-[#D4AF37] transition-colors"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => { if (confirm('Supprimer ce coiffeur ?')) deleteBarber(barber.id); }} className="p-2.5 bg-white/5 rounded-xl text-white/40 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'services' && (
                <motion.div key="services" className="space-y-6">
                  <div className="flex justify-between items-center"><h2 className="text-3xl font-black uppercase">Services</h2><button onClick={() => { setEditingService(null); setServiceModalOpen(true); }} className="px-6 py-3 bg-[#D4AF37] text-black rounded-2xl font-black text-sm uppercase">Nouveau Service</button></div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {services.map(service => (
                      <div key={service.id} className="bg-[#141414] border border-white/5 p-6 rounded-3xl flex justify-between items-center group">
                        <div className="flex gap-6 items-center">
                          <img src={service.image} className="w-20 h-20 rounded-2xl object-cover group-hover:scale-105 transition-transform" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=150&h=150&fit=crop'; }} />
                          <div>
                            <h4 className="font-bold text-lg">{service.name}</h4>
                            <p className="text-xs text-white/40 font-bold uppercase tracking-widest">{service.duration} • <span className="text-[#D4AF37]">€{service.price}</span></p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditingService(service); setServiceModalOpen(true); }} className="p-2 text-white/20 hover:text-[#D4AF37] transition-colors"><Edit className="w-5 h-5" /></button>
                          <button onClick={() => { if (confirm('Supprimer ce service ?')) deleteService(service.id); }} className="p-2 text-white/20 hover:text-red-400 transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'boutique' && (
                <motion.div key="boutique" className="space-y-8">
                  {/* Header with action buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-3xl font-black uppercase">Boutique</h2>
                    <div className="flex flex-wrap gap-3">
                      <a
                        href="/boutique"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-5 py-3 bg-white/5 border border-white/10 text-white/70 hover:text-white hover:border-white/30 rounded-2xl font-black text-sm transition-all flex items-center gap-2"
                      >
                        <ShoppingBag className="w-4 h-4" /> Voir la Boutique
                      </a>
                      <button
                        onClick={() => { setEditingProduct(null); setProductModalOpen(true); }}
                        className="px-6 py-3 bg-white/10 border border-white/20 text-white rounded-2xl font-black text-sm hover:bg-white/20 transition-all flex items-center gap-2"
                      >
                        + Ajouter Produit
                      </button>
                    </div>
                  </div>

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
                              <button onClick={() => { setEditingProduct(product); setProductModalOpen(true); }} className="p-2 bg-white/5 text-white/40 hover:text-[#D4AF37] rounded-xl transition-colors">
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm('Supprimer ?')) deleteProduct(product.id); }} className="p-2 bg-white/5 text-white/40 hover:text-red-400 rounded-xl transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <section>
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <DollarSign className="w-5 h-5 text-green-400" /> Historique des Ventes
                    </h3>
                    <SalesReport sales={sales} products={products} barbers={barbers} />
                  </section>
                </motion.div>
              )}

              {activeTab === 'reports' && (
                <motion.div key="reports" className="space-y-8">
                  <BarberAnalytics bookings={bookings} barbers={barbers} services={services} attendance={attendance} />
                </motion.div>
              )}

              {activeTab === 'attendance' && (
                <motion.div key="attendance" className="space-y-12">
                  <section>
                    <h2 className="text-3xl font-black uppercase mb-8">Pointage Coiffeurs</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {barbers.map(barber => (
                        <div key={barber.id} className="bg-[#141414] border border-white/5 p-10 rounded-[2.5rem] text-center flex flex-col items-center group">
                          <p className="font-black text-lg mb-6 uppercase tracking-tight">{barber.name}</p>
                          <div className="bg-white p-6 rounded-[2rem] mb-6 shadow-2xl shadow-white/5 group-hover:scale-105 transition-transform"><QRCodeCanvas value={JSON.stringify({ barberId: barber.id, type: 'check-in' })} size={180} /></div>
                          <p className="text-[10px] text-white/30 uppercase font-black tracking-[0.2em]">Scanner pour pointer</p>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section><AttendanceHistory attendance={attendance} barbers={barbers} /></section>
                </motion.div>
              )}

              {activeTab === 'branding' && (
                <motion.div key="branding" className="space-y-8">
                  <h2 className="text-3xl font-black uppercase">Design & Branding</h2>
                  <BrandingSection businessInfo={businessInfo} updateBusinessInfo={updateBusinessInfo} handleImageUpload={handleImageUpload} />
                </motion.div>
              )}

              {activeTab === 'gallery' && (
                <motion.div key="gallery" className="space-y-8">
                  <div className="flex justify-between items-center"><h2 className="text-3xl font-black uppercase">Portfolio</h2><label className="px-8 py-4 bg-[#D4AF37] text-black rounded-2xl font-black text-sm cursor-pointer shadow-xl shadow-[#D4AF37]/20 uppercase">Envoyer des Photos<input type="file" className="hidden" accept="image/*" multiple onChange={async (e) => { const files = Array.from(e.target.files || []); for (const file of files) { const url = await handleImageUpload(file); await addToGallery(url); } toast.success('Galerie mise à jour'); }} /></label></div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
                    {gallery.map((url, i) => (
                      <div key={i} className="relative aspect-square rounded-[2rem] overflow-hidden group border border-white/5 shadow-2xl shadow-black/50">
                        <img src={url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                        <button onClick={() => removeFromGallery(url)} className="absolute top-4 right-4 p-3 bg-red-500 rounded-2xl opacity-0 group-hover:opacity-100 transition-all hover:scale-110"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'settings' && (
                <motion.div key="settings" className="space-y-8 pb-20">
                  <h2 className="text-3xl font-black uppercase tracking-tighter">Paramètres Généraux</h2>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Basic Info */}
                    <div className="bg-[#141414] border border-white/5 p-8 rounded-[2.5rem] space-y-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
                          <Settings className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <h3 className="text-xl font-bold">Identité & Contact</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Nom du Salon</label>
                          <input defaultValue={businessInfo.name} onBlur={(e) => updateBusinessInfo({ name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" />
                        </div>
                        <div>
                          <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Téléphone</label>
                          <input defaultValue={businessInfo.phone} onBlur={(e) => updateBusinessInfo({ phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" />
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2 text-[#D4AF37]">Adresse E-mail (Admin Login)</label>
                        <input defaultValue={businessInfo.email} onBlur={(e) => updateBusinessInfo({ email: e.target.value })} className="w-full bg-white/10 border border-[#D4AF37]/30 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" />
                      </div>
                      
                      <div>
                        <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Adresse Physique</label>
                        <input defaultValue={businessInfo.address} onBlur={(e) => updateBusinessInfo({ address: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" />
                      </div>

                      <div className="space-y-4 pt-4 border-t border-white/5">
                        <h4 className="text-xs font-black uppercase text-[#D4AF37] tracking-wider mb-2">Réseaux Sociaux & Liens</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Instagram</label>
                            <div className="flex gap-2">
                               <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-center w-11"><Instagram className="w-5 h-5 text-pink-500" /></div>
                               <input defaultValue={businessInfo.instagram} onBlur={(e) => updateBusinessInfo({ instagram: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold text-xs" placeholder="https://instagram.com/..." />
                            </div>
                          </div>

                          <div>
                            <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">TikTok</label>
                            <div className="flex gap-2">
                               <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-center w-11"><Link className="w-5 h-5 text-amber-500" /></div>
                               <input defaultValue={businessInfo.tiktok} onBlur={(e) => updateBusinessInfo({ tiktok: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold text-xs" placeholder="https://tiktok.com/@..." />
                            </div>
                          </div>

                          <div>
                            <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Facebook</label>
                            <div className="flex gap-2">
                               <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-center w-11"><Facebook className="w-5 h-5 text-blue-500" /></div>
                               <input defaultValue={businessInfo.facebook} onBlur={(e) => updateBusinessInfo({ facebook: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold text-xs" placeholder="https://facebook.com/..." />
                            </div>
                          </div>

                          <div>
                            <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Site Web</label>
                            <div className="flex gap-2">
                               <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-center w-11"><Globe className="w-5 h-5 text-green-400" /></div>
                               <input defaultValue={businessInfo.website} onBlur={(e) => updateBusinessInfo({ website: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold text-xs" placeholder="https://..." />
                            </div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Intégration Google Maps (Iframe URL)</label>
                          <div className="flex gap-2">
                             <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-center w-11"><MapPin className="w-5 h-5 text-red-500" /></div>
                             <input defaultValue={businessInfo.mapUrl} onBlur={(e) => updateBusinessInfo({ mapUrl: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold text-xs" placeholder="URL d'intégration Iframe Google Maps" />
                          </div>
                          <p className="text-[9px] text-white/20 mt-1 italic">Entrez l'attribut `src` de l'iframe généré par Google Maps Share.</p>
                        </div>
                      </div>
                    </div>

                    {/* Hours & Logo */}
                    <div className="space-y-8">
                       <div className="bg-[#141414] border border-white/5 p-8 rounded-[2.5rem] space-y-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
                            <Clock className="w-5 h-5 text-[#D4AF37]" />
                          </div>
                          <h3 className="text-xl font-bold">Horaires d'Ouverture</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">En Semaine (Lun-Ven)</label>
                            <input defaultValue={businessInfo.hours.weekdays} onBlur={(e) => updateBusinessInfo({ hours: { ...businessInfo.hours, weekdays: e.target.value } })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" placeholder="ex: 9h-19h" />
                          </div>
                          <div>
                            <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Week-end (Sam-Dim)</label>
                            <input defaultValue={businessInfo.hours.weekends} onBlur={(e) => updateBusinessInfo({ hours: { ...businessInfo.hours, weekends: e.target.value } })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" placeholder="ex: 10h-17h" />
                          </div>
                        </div>
                      </div>

                      <div className="bg-[#141414] border border-white/5 p-8 rounded-[2.5rem]">
                        <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-4">Logo du Salon</label>
                        <div className="flex items-center gap-8">
                           <div className="w-24 h-24 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                              {businessInfo.logo ? <img src={businessInfo.logo} className="w-full h-full object-contain p-2" /> : <Scissors className="w-8 h-8 text-white/10" />}
                           </div>
                           <label className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm cursor-pointer transition-colors">
                              Modifier le Logo
                              <input type="file" className="hidden" accept="image/*" onChange={async (e) => {
                                 const file = e.target.files?.[0];
                                 if (file) {
                                    const url = await handleImageUpload(file);
                                    updateBusinessInfo({ logo: url });
                                    toast.success('Logo mis à jour');
                                 }
                              }} />
                           </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Danger Zone */}
                  <div className="bg-red-500/5 border border-red-500/10 p-8 rounded-[2.5rem]">
                    <h3 className="text-red-500 font-bold mb-4 flex items-center gap-2"><X className="w-5 h-5" /> Zone de Danger</h3>
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                       <p className="text-white/40 text-sm max-w-md">Utilisez ce bouton pour réinitialiser les données de test (Seed). Vos données existantes ne seront pas supprimées.</p>
                       <button onClick={() => { if (confirm('Générer des données de test ?')) seedDatabase(); }} className="px-8 py-4 border-2 border-red-500/20 text-red-500 rounded-2xl font-black uppercase text-sm hover:bg-red-500 hover:text-white transition-all">Générer Données de Test</button>
                    </div>
                  </div>
                </motion.div>
              )}
              
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
                              updateBookingStatus(bookingToReject, 'rejected', 'admin');
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
            </Suspense>
          </AnimatePresence>
        </main>
      </div>

      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-3xl border-t border-white/10 flex items-center overflow-x-auto no-scrollbar z-50 py-3 px-4">
        <div className="flex gap-4 mx-auto">
          {sidebarTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex flex-col items-center gap-1.5 transition-all min-w-[65px] ${activeTab === tab.id ? 'text-[#D4AF37] scale-110' : 'text-white/20'}`}>
              <tab.icon className="w-5 h-5" />
              <span className="text-[9px] font-black uppercase tracking-tighter">{tab.label.split(' ')[0]}</span>
            </button>
          ))}
          <button onClick={handleLogout} className="flex flex-col items-center gap-1.5 text-red-500/40 min-w-[65px]">
            <LogOut className="w-5 h-5" />
            <span className="text-[9px] font-black uppercase tracking-tighter">Exit</span>
          </button>
        </div>
      </div>

      <Suspense fallback={null}>
        {barberModalOpen && <BarberModal barber={editingBarber} services={services} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setBarberModalOpen(false)} onSave={async (data) => {
          setIsSaving(true);
          try {
            // Trim and lowercase the email address
            if (data.email) {
              data.email = data.email.trim().toLowerCase();
            }
            if (editingBarber) {
              await updateBarber(editingBarber.id, data);
              
              // Secure Audit Logging for profile/credentials update
              await addDoc(collection(db, 'audit_logs'), {
                action: 'update_barber',
                barberId: editingBarber.id,
                barberName: data.name,
                adminEmail: user?.email || 'admin@test.com',
                timestamp: new Date().toISOString(),
                details: 'Barber profile or credentials modified by admin'
              });
            } else {
              if (data.email && data.password) {
                try {
                  await Promise.race([
                    createBarberAccount(data.email, data.password),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Auth Timeout")), 35000))
                  ]);
                } catch (err: any) {
                  if (err.code === 'auth/email-already-in-use') {
                    console.warn("Email already in use");
                  } else if (err.message === "Auth Timeout") {
                    console.warn("Auth creation taking time, proceeding...");
                  } else throw err;
                }
              }
              await addBarber(data as any);
              
              // Secure Audit Logging for new barber profile/credentials creation
              await addDoc(collection(db, 'audit_logs'), {
                action: 'create_barber',
                barberName: data.name,
                adminEmail: user?.email || 'admin@test.com',
                timestamp: new Date().toISOString(),
                details: 'New barber profile and credentials created by admin'
              });

              // Try to pre-set user profile role for immediate Barber Dashboard routing
              try {
                const usersCol = collection(db, 'users');
                const q = query(usersCol, where('email', '==', data.email));
                const snap = await getDocs(q);
                if (!snap.empty) {
                  await updateDoc(doc(db, 'users', snap.docs[0].id), { role: 'barber' });
                }
              } catch (e) {
                console.warn("Could not pre-set user role", e);
              }
            }
            await triggerSuccess(() => setBarberModalOpen(false));
          } catch (err: any) {
            setIsSaving(false);
            console.error(err);
            toast.error(err.message ?? 'Erreur lors de l\'enregistrement');
          }
        }} />}
        {serviceModalOpen && <ServiceModal service={editingService} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setServiceModalOpen(false)} onSave={async (data) => {
          setIsSaving(true);
          try {
            if (editingService) await updateService(editingService.id, data);
            else await addService(data as any);
            await triggerSuccess(() => setServiceModalOpen(false));
          } catch (err) {
            setIsSaving(false);
            console.error(err);
            toast.error('Erreur lors de l\'enregistrement');
          }
        }} />}
        {productModalOpen && <ProductModal product={editingProduct} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setProductModalOpen(false)} onSave={async (data) => {
          setIsSaving(true);
          try {
            if (editingProduct) await updateProduct(editingProduct.id, data);
            else await addProduct(data as any);
            await triggerSuccess(() => setProductModalOpen(false));
          } catch (err: any) {
            setIsSaving(false);
            console.error(err);
            toast.error('Erreur: ' + (err?.message || 'Erreur inconnue'));
          }
        }} />}
        {isManualBookingOpen && <ManualBookingModal onClose={() => setIsManualBookingOpen(false)} />}
        {posProduct && (
          <POSSaleModal
            product={posProduct}
            onClose={() => setPosProduct(null)}
            onSell={async ({ productId, quantity, customPrice, discount, paymentMethod, notes }) => {
              const now = new Date();
              await addSale({
                productId,
                sellerId: user?.uid || 'admin',
                date: now.toISOString().split('T')[0],
                time: now.toTimeString().split(' ')[0].substring(0, 5),
                quantity,
                buyPrice: posProduct.buyPrice || 0,
                sellPrice: posProduct.sellPrice || 0,
                customPrice,
                discount,
                paymentMethod,
                notes,
              } as any);
              if (posProduct.trackStock !== false && posProduct.stock != null) {
                await updateProduct(posProduct.id, { stock: Math.max(0, posProduct.stock - quantity) });
              }
              toast.success(`Vente enregistrée — €${(customPrice * quantity * (1 - discount / 100)).toFixed(2)}`);
              setPosProduct(null);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}
