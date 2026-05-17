import { useState, useMemo, useCallback, lazy, Suspense } from 'react';
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
import { toast } from 'sonner';
import { QRCodeCanvas } from 'qrcode.react';
import type { Barber, Service, Product } from '../context/BusinessContext';
import { db } from '../../lib/firebase';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';

// Lazy load components
const PerformanceChart = lazy(() => import('../admin/AdminCharts').then(m => ({ default: m.PerformanceChart })));
const RevenueChart = lazy(() => import('../admin/AdminCharts').then(m => ({ default: m.RevenueChart })));
const BarberModal = lazy(() => import('../admin/BarberModal'));
const ServiceModal = lazy(() => import('../admin/ServiceModal'));
const ProductModal = lazy(() => import('../admin/ProductModal'));
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
  const [activeTab, setActiveTab] = useState('dashboard');
  const [dateFilter, setDateFilter] = useState<'all' | 'day' | 'week' | 'month' | 'custom'>('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [barberFilter, setBarberFilter] = useState('all');
  const [isSaving, setIsSaving] = useState(false);

  const [barberModalOpen, setBarberModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

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

  const sidebarTabs = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'bookings', icon: Calendar, label: 'Réservations' },
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
      <nav className="bg-black/60 backdrop-blur-xl border-b border-white/5 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent tracking-tighter">ELITE CUTS ADMIN</h1>
          </div>
          <div className="flex items-center gap-6">
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
                  <div className="flex justify-between items-center"><h2 className="text-3xl font-black">RÉSERVATIONS</h2>{renderDateFilterSelector()}</div>
                  <div className="space-y-3">
                    {filteredBookings.length === 0 ? (
                      <div className="text-center py-24 bg-[#141414] rounded-[2.5rem] border border-white/5 text-white/20 italic">Aucune réservation pour cette période.</div>
                    ) : filteredBookings.map(booking => (
                      <div key={booking.id} className="bg-[#141414] border border-white/5 p-6 rounded-3xl flex flex-col md:flex-row justify-between items-center gap-6 hover:border-[#D4AF37]/30 transition-all">
                        <div className="flex gap-6 items-center w-full md:w-auto">
                          <div className="w-14 h-14 bg-gradient-to-br from-[#D4AF37] to-[#FFD700] rounded-2xl flex items-center justify-center font-black text-black text-xl shadow-lg shadow-[#D4AF37]/20">{booking.clientName[0]}</div>
                          <div>
                            <h4 className="font-bold text-lg">{booking.clientName}</h4>
                            <p className="text-[#D4AF37] text-xs font-bold uppercase tracking-wider">{services.find(s => s.id === booking.serviceId)?.name}</p>
                            <div className="flex gap-4 text-[10px] text-white/40 mt-1 uppercase font-bold">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {booking.date}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {booking.time}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-3 w-full md:w-auto justify-end">
                          {booking.status === 'pending' && (
                            <>
                              <button onClick={() => updateBookingStatus(booking.id, 'approved')} className="px-6 py-2.5 bg-green-500/10 text-green-400 rounded-xl hover:bg-green-500 hover:text-white transition-all text-xs font-black uppercase">Approuver</button>
                              <button onClick={() => updateBookingStatus(booking.id, 'rejected')} className="px-6 py-2.5 bg-red-500/10 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all text-xs font-black uppercase">Rejeter</button>
                            </>
                          )}
                          <span className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${booking.status === 'approved' ? 'bg-green-500/10 text-green-400' : booking.status === 'rejected' ? 'bg-red-500/10 text-red-400' : booking.status === 'completed' ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                            {booking.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              {activeTab === 'barbers' && (
                <motion.div key="barbers" className="space-y-6">
                  <div className="flex justify-between items-center"><h2 className="text-3xl font-black uppercase">Coiffeurs</h2><button onClick={() => { setEditingBarber(null); setBarberModalOpen(true); }} className="px-6 py-3 bg-[#D4AF37] text-black rounded-2xl font-black text-sm hover:scale-105 transition-all shadow-xl shadow-[#D4AF37]/20 uppercase">Nouveau Coiffeur</button></div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {barbers.map(barber => (
                      <div key={barber.id} className="bg-[#141414] border border-white/5 p-6 rounded-[2rem] flex gap-6 items-center group relative overflow-hidden">
                        <img src={barber.image} className="w-24 h-24 rounded-3xl object-cover group-hover:scale-105 transition-transform" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&h=150&fit=crop'; }} />
                        <div className="flex-1">
                          <h4 className="text-xl font-bold">{barber.name}</h4>
                          <p className="text-[#D4AF37] text-xs font-black uppercase tracking-widest">{barber.specialty}</p>
                          <div className="mt-4 flex gap-2">
                            <button onClick={() => { setEditingBarber(barber); setBarberModalOpen(true); }} className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-[#D4AF37] transition-colors"><Edit className="w-5 h-5" /></button>
                            <button onClick={() => { if (confirm('Supprimer ce coiffeur ?')) deleteBarber(barber.id); }} className="p-3 bg-white/5 rounded-xl text-white/40 hover:text-red-400 transition-colors"><Trash2 className="w-5 h-5" /></button>
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
                  <div className="flex justify-between items-center"><h2 className="text-3xl font-black uppercase">Boutique</h2></div>
                  <div className="space-y-12">
                    <section><h3 className="text-lg font-bold mb-6 flex items-center gap-2"><Archive className="w-5 h-5 text-[#D4AF37]" /> Stock & Inventaire</h3><ProductManagement products={products} onEdit={(p: any) => { setEditingProduct(p); setProductModalOpen(true); }} onDelete={deleteProduct} onAdd={() => { setEditingProduct(null); setProductModalOpen(true); }} /></section>
                    <section><h3 className="text-lg font-bold mb-6 flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-400" /> Historique des Ventes</h3><SalesReport sales={sales} products={products} barbers={barbers} /></section>
                  </div>
                </motion.div>
              )}

              {activeTab === 'reports' && (
                <motion.div key="reports" className="space-y-8">
                  <h2 className="text-3xl font-black uppercase">Rapports Financiers</h2>
                  <FinanceReport bookings={bookings} services={services} sales={sales} />
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

                      <div className="pt-4">
                        <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Lien Instagram</label>
                        <div className="flex gap-2">
                           <div className="bg-white/5 p-3 rounded-xl border border-white/10"><Instagram className="w-5 h-5 text-pink-500" /></div>
                           <input defaultValue={businessInfo.instagram} onBlur={(e) => updateBusinessInfo({ instagram: e.target.value })} className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" placeholder="https://instagram.com/..." />
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
        {barberModalOpen && <BarberModal barber={editingBarber} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setBarberModalOpen(false)} onSave={async (data) => {
          setIsSaving(true);
          try {
            // Trim and lowercase the email address
            if (data.email) {
              data.email = data.email.trim().toLowerCase();
            }
            if (editingBarber) {
              await updateBarber(editingBarber.id, data);
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
              const { password, ...barberData } = data;
              await addBarber(barberData as any);
              
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
          } catch (err) {
            setIsSaving(false);
            console.error(err);
            toast.error('Erreur lors de l\'enregistrement');
          }
        }} />}
      </Suspense>
    </div>
  );
}
