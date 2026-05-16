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

// Lazy load components
const PerformanceChart = lazy(() => import('../admin/AdminCharts').then(m => ({ default: m.PerformanceChart })));
const RevenueChart = lazy(() => import('../admin/AdminCharts').then(m => ({ default: m.RevenueChart })));
const BarberModal = lazy(() => import('../admin/BarberModal'));
const ServiceModal = lazy(() => import('../admin/ServiceModal'));
const ProductModal = lazy(() => import('../admin/ProductModal'));

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
        else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
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
  const [isUploading, setIsUploading] = useState(false);

  const [barberModalOpen, setBarberModalOpen] = useState(false);
  const [editingBarber, setEditingBarber] = useState<Barber | null>(null);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const triggerSuccess = (callback: () => void) => {
    toast.custom((t) => (
      <div className="bg-[#141414] border border-green-500/50 p-6 rounded-2xl flex flex-col items-center justify-center gap-4 shadow-2xl w-full min-w-[300px]">
        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-500" />
        </div>
        <h3 className="text-xl font-bold text-white">Action réussie !</h3>
      </div>
    ), { duration: 1500, position: 'top-center' });
    setTimeout(callback, 1500);
  };

  const handleImageUpload = async (file: File): Promise<string> => {
    return await compressImage(file);
  };

  const parsePrice = (priceStr: string | undefined) => priceStr ? (parseInt(priceStr.replace(/[^0-9]/g, ''), 10) || 0) : 0;
  
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
      end = new Date(start.getTime());
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
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
  const pendingBookings = useMemo(() => bookings.filter(b => b.status === 'pending'), [bookings]);

  const totalRevenue = useMemo(() => approvedBookings.reduce((sum, b) => sum + (b.pricePaid || 0), 0), [approvedBookings]);
  const totalCash = useMemo(() => approvedBookings.reduce((sum, b) => b.paymentMethod === 'cash' ? sum + (b.pricePaid || 0) : sum, 0), [approvedBookings]);
  const totalCard = useMemo(() => approvedBookings.reduce((sum, b) => b.paymentMethod === 'card' ? sum + (b.pricePaid || 0) : sum, 0), [approvedBookings]);

  const revenueTrend = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
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
          <input type="date" value={customDateRange.start} onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))} className="bg-[#141414] border border-[#D4AF37]/20 text-white text-xs rounded-lg px-2 py-1.5 outline-none focus:border-[#D4AF37]" />
          <input type="date" value={customDateRange.end} onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))} className="bg-[#141414] border border-[#D4AF37]/20 text-white text-xs rounded-lg px-2 py-1.5 outline-none focus:border-[#D4AF37]" />
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <nav className="bg-[#0f0f0f] border-b border-[#D4AF37]/20 px-6 py-4 sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">Elite Cuts Admin</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden md:block text-right">
              <p className="text-sm font-bold">{user?.name || 'Administrateur'}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Premium Access</p>
            </div>
            <button onClick={handleLogout} className="p-2 hover:bg-white/5 rounded-full transition-colors text-white/60 hover:text-white"><LogOut className="w-5 h-5" /></button>
          </div>
        </div>
      </nav>

      <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row gap-8 p-6 pb-24 md:pb-8">
        {/* Sidebar */}
        <aside className="md:w-64 space-y-2 hidden md:block">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'bookings', icon: Calendar, label: 'Réservations' },
            { id: 'reports', icon: TrendingUp, label: 'Rapports' },
            { id: 'barbers', icon: Users, label: 'Coiffeurs' },
            { id: 'services', icon: Scissors, label: 'Services' },
            { id: 'boutique', icon: ShoppingBag, label: 'Boutique' },
            { id: 'gallery', icon: ImageIcon, label: 'Portfolio' },
            { id: 'attendance', icon: Clock, label: 'Pointage' },
            { id: 'branding', icon: Settings, label: 'Design' },
            { id: 'settings', icon: Settings, label: 'Paramètres' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === tab.id ? 'bg-[#D4AF37] text-black font-bold shadow-lg shadow-[#D4AF37]/20' : 'text-white/60 hover:bg-white/5'}`}>
              <tab.icon className="w-5 h-5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h2 className="text-3xl font-bold">Vue d'ensemble</h2>
                  {renderDateFilterSelector()}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[
                    { label: 'Revenu Total', value: `€${totalRevenue}`, icon: DollarSign, color: 'text-green-400' },
                    { label: 'Réservations', value: filteredBookings.length, icon: Calendar, color: 'text-blue-400' },
                    { label: 'Coiffeurs Actifs', value: barbers.filter(b => !b.archived).length, icon: Users, color: 'text-purple-400' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-3xl hover:border-[#D4AF37]/30 transition-colors group">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-2xl bg-white/5 group-hover:scale-110 transition-transform ${stat.color}`}><stat.icon className="w-6 h-6" /></div>
                      </div>
                      <p className="text-white/40 text-sm">{stat.label}</p>
                      <p className="text-3xl font-bold mt-1">{stat.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                  <div className="bg-[#141414] border border-[#D4AF37]/10 p-8 rounded-3xl">
                    <h3 className="text-xl font-bold mb-8">Performance des Coiffeurs</h3>
                    <div className="h-[300px]">
                      <Suspense fallback={<div className="w-full h-full bg-white/5 animate-pulse rounded-2xl" />}>
                        <PerformanceChart data={barberPerformance} />
                      </Suspense>
                    </div>
                  </div>
                  <div className="bg-[#141414] border border-[#D4AF37]/10 p-8 rounded-3xl">
                    <h3 className="text-xl font-bold mb-8">Tendance des Revenus</h3>
                    <div className="h-[300px]">
                      <Suspense fallback={<div className="w-full h-full bg-white/5 animate-pulse rounded-2xl" />}>
                        <RevenueChart data={revenueTrend} />
                      </Suspense>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'bookings' && (
              <motion.div key="bookings" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Réservations</h2>
                  <div className="flex gap-4">
                    {renderDateFilterSelector()}
                  </div>
                </div>
                <div className="space-y-4">
                  {filteredBookings.length === 0 ? (
                    <div className="text-center py-20 bg-[#141414] rounded-3xl border border-[#D4AF37]/10 text-white/40 italic">Aucune réservation trouvée.</div>
                  ) : (
                    filteredBookings.map(booking => (
                      <div key={booking.id} className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex gap-6 items-center w-full md:w-auto">
                          <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center font-bold text-[#D4AF37]">{booking.clientName[0]}</div>
                          <div>
                            <h4 className="font-bold text-lg">{booking.clientName}</h4>
                            <div className="flex gap-4 text-sm text-white/40 mt-1">
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {booking.date}</span>
                              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {booking.time}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-4 w-full md:w-auto justify-end">
                          {booking.status === 'pending' && (
                            <>
                              <button onClick={() => updateBookingStatus(booking.id, 'approved')} className="px-6 py-2 bg-green-500/20 text-green-400 rounded-xl hover:bg-green-500 hover:text-white transition-all font-bold">Approuver</button>
                              <button onClick={() => updateBookingStatus(booking.id, 'rejected')} className="px-6 py-2 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500 hover:text-white transition-all font-bold">Rejeter</button>
                            </>
                          )}
                          <span className={`px-4 py-2 rounded-xl text-xs font-bold ${booking.status === 'approved' ? 'bg-green-500/20 text-green-400' : booking.status === 'rejected' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                            {booking.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'barbers' && (
              <motion.div key="barbers" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Coiffeurs</h2>
                  <button onClick={() => { setEditingBarber(null); setBarberModalOpen(true); }} className="px-6 py-3 bg-[#D4AF37] text-black rounded-xl font-bold hover:scale-105 transition-all">Ajouter Coiffeur</button>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {barbers.map(barber => (
                    <div key={barber.id} className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-3xl flex gap-6 items-center group">
                      <img src={barber.image} className="w-24 h-24 rounded-2xl object-cover" />
                      <div className="flex-1">
                        <h4 className="text-xl font-bold">{barber.name}</h4>
                        <p className="text-[#D4AF37] text-sm">{barber.specialty}</p>
                        <div className="mt-4 flex gap-2">
                          <button onClick={() => { setEditingBarber(barber); setBarberModalOpen(true); }} className="p-2 bg-white/5 rounded-lg text-white/60 hover:text-[#D4AF37] transition-colors"><Edit className="w-5 h-5" /></button>
                          <button onClick={() => { if (confirm('Supprimer ce coiffeur ?')) deleteBarber(barber.id); }} className="p-2 bg-white/5 rounded-lg text-white/60 hover:text-red-400 transition-colors"><Trash2 className="w-5 h-5" /></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Other tabs follow the same optimized pattern... */}
            {activeTab === 'services' && (
              <motion.div key="services" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Services</h2>
                  <button onClick={() => { setEditingService(null); setServiceModalOpen(true); }} className="px-6 py-3 bg-[#D4AF37] text-black rounded-xl font-bold">Ajouter Service</button>
                </div>
                <div className="space-y-4">
                  {services.map(service => (
                    <div key={service.id} className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-2xl flex justify-between items-center">
                      <div className="flex gap-6 items-center">
                        <img src={service.image} className="w-16 h-16 rounded-xl object-cover" />
                        <div>
                          <h4 className="font-bold">{service.name}</h4>
                          <p className="text-sm text-white/40">{service.duration} • <span className="text-[#D4AF37] font-bold">{service.price}</span></p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditingService(service); setServiceModalOpen(true); }} className="p-2 text-white/40 hover:text-[#D4AF37]"><Edit className="w-5 h-5" /></button>
                        <button onClick={() => { if (confirm('Supprimer ce service ?')) deleteService(service.id); }} className="p-2 text-white/40 hover:text-red-400"><Trash2 className="w-5 h-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'gallery' && (
              <motion.div key="gallery" className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Portfolio</h2>
                  <label className="px-6 py-3 bg-[#D4AF37] text-black rounded-xl font-bold cursor-pointer">
                    <input type="file" className="hidden" accept="image/*" multiple onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      for (const file of files) {
                        const url = await handleImageUpload(file);
                        await addToGallery(url);
                      }
                      toast.success('Gallery updated');
                    }} />
                    Envoyer des Photos
                  </label>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {gallery.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-2xl overflow-hidden group border border-white/5">
                      <img src={url} className="w-full h-full object-cover" />
                      <button onClick={() => removeFromGallery(url)} className="absolute top-2 right-2 p-2 bg-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
            
            {activeTab === 'attendance' && (
              <motion.div key="attendance" className="space-y-6">
                 <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">Pointage & QR Codes</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {barbers.map(barber => (
                    <div key={barber.id} className="bg-[#141414] border border-[#D4AF37]/10 p-8 rounded-3xl text-center flex flex-col items-center">
                      <p className="font-bold mb-4">{barber.name}</p>
                      <div className="bg-white p-4 rounded-2xl mb-4">
                        <QRCodeCanvas value={JSON.stringify({ barberId: barber.id, type: 'check-in' })} size={150} />
                      </div>
                      <p className="text-[10px] text-white/40 uppercase">Scanner pour pointer</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'settings' && (
              <motion.div key="settings" className="space-y-6">
                <h2 className="text-3xl font-bold">Paramètres Entreprise</h2>
                <div className="bg-[#141414] border border-[#D4AF37]/10 p-8 rounded-3xl space-y-6 max-w-2xl">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-white/40 text-sm mb-2">Nom du Salon</label>
                      <input defaultValue={businessInfo.name} onBlur={(e) => updateBusinessInfo({ name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37]" />
                    </div>
                    <div>
                      <label className="block text-white/40 text-sm mb-2">Téléphone</label>
                      <input defaultValue={businessInfo.phone} onBlur={(e) => updateBusinessInfo({ phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37]" />
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Seed database with default data?')) seedDatabase(); }} className="w-full py-4 border border-[#D4AF37]/30 rounded-xl text-[#D4AF37] font-bold hover:bg-[#D4AF37]/10 transition-colors">Réinitialiser les données (Seed)</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#0f0f0f] border-t border-[#D4AF37]/20 flex overflow-x-auto scrollbar-hide z-50">
        {[
          { id: 'dashboard', icon: LayoutDashboard },
          { id: 'bookings', icon: Calendar },
          { id: 'barbers', icon: Users },
          { id: 'services', icon: Scissors },
          { id: 'gallery', icon: ImageIcon },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 p-4 flex justify-center items-center ${activeTab === tab.id ? 'text-[#D4AF37]' : 'text-white/40'}`}>
            <tab.icon className="w-6 h-6" />
          </button>
        ))}
      </div>

      {/* Lazy Modals */}
      <Suspense fallback={null}>
        {barberModalOpen && <BarberModal barber={editingBarber} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setBarberModalOpen(false)} onSave={async (data) => { setIsSaving(true); try { if (editingBarber) await updateBarber(editingBarber.id, data); else await addBarber(data as any); triggerSuccess(() => setBarberModalOpen(false)); } finally { setIsSaving(false); } }} />}
        {serviceModalOpen && <ServiceModal service={editingService} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setServiceModalOpen(false)} onSave={async (data) => { setIsSaving(true); try { if (editingService) await updateService(editingService.id, data); else await addService(data as any); triggerSuccess(() => setServiceModalOpen(false)); } finally { setIsSaving(false); } }} />}
        {productModalOpen && <ProductModal product={editingProduct} isSaving={isSaving} handleImageUpload={handleImageUpload} onClose={() => setProductModalOpen(false)} onSave={async (data) => { setIsSaving(true); try { if (editingProduct) await updateProduct(editingProduct.id, data); else await addProduct(data as any); triggerSuccess(() => setProductModalOpen(false)); } finally { setIsSaving(false); } }} />}
      </Suspense>
    </div>
  );
}
