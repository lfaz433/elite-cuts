import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, deleteDoc, query, where, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { motion } from 'motion/react';
import { LayoutDashboard, Users, CreditCard, Gift, Search, RefreshCw, Zap, TrendingUp, CheckCircle, Clock, XCircle, AlertCircle, Calendar, AlertTriangle, Hourglass, Mail, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useNavigate } from 'react-router';

export default function SuperAdmin() {
  const { user, logout: signOut } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [tenants, setTenants] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [manualPayments, setManualPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [freeSubdomain, setFreeSubdomain] = useState('');
  const [freePlan, setFreePlan] = useState('pro');

  // Tenant Detail & Edit modal states
  const [selectedTenant, setSelectedTenant] = useState<any>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrimaryColor, setEditPrimaryColor] = useState('');
  const [editMaxBarbers, setEditMaxBarbers] = useState(2);
  const [editPlanId, setEditPlanId] = useState('basic');
  const [editStatus, setEditStatus] = useState('active');
  const [editOnlineBookingEnabled, setEditOnlineBookingEnabled] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  // Manual payments filter states
  const [paySearch, setPaySearch] = useState('');
  const [payStatusFilter, setPayStatusFilter] = useState('all');
  const [payMethodFilter, setPayMethodFilter] = useState('all');
  const [payCurrencyFilter, setPayCurrencyFilter] = useState('all');
  const [payDateFrom, setPayDateFrom] = useState('');
  const [payDateTo, setPayDateTo] = useState('');

  // Tenant filter, pagination, and sorting states
  const [tenantSearch, setTenantSearch] = useState('');
  const [tenantStatusFilter, setTenantStatusFilter] = useState('all');
  const [tenantPlanFilter, setTenantPlanFilter] = useState('all');
  const [tenantPage, setTenantPage] = useState(1);
  const [tenantSortColumn, setTenantSortColumn] = useState('name');
  const [tenantSortDirection, setTenantSortDirection] = useState<'asc' | 'desc'>('asc');

  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Manual payment modals states
  const [isNewPaymentModalOpen, setIsNewPaymentModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<any>(null);
  const [isEditPaymentMode, setIsEditPaymentMode] = useState(false);

  // New Payment Form states
  const [newPayTenantId, setNewPayTenantId] = useState('');
  const [newPayClientName, setNewPayClientName] = useState('');
  const [newPayAmountPaid, setNewPayAmountPaid] = useState<number>(0);
  const [newPayCurrency, setNewPayCurrency] = useState('EUR');
  const [newPayExchangeRate, setNewPayExchangeRate] = useState<number>(1);
  const [newPayMethod, setNewPayMethod] = useState<'cash' | 'bank_transfer' | 'western_union' | 'paypal' | 'other'>('cash');
  const [newPayReference, setNewPayReference] = useState('');
  const [newPayPlanId, setNewPayPlanId] = useState<'basic' | 'pro' | 'enterprise'>('basic');
  const [newPayDuration, setNewPayDuration] = useState<'monthly' | 'yearly'>('monthly');
  const [newPayStatus, setNewPayStatus] = useState<'paid' | 'pending' | 'partial'>('paid');
  const [newPayDate, setNewPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [newPayNotes, setNewPayNotes] = useState('');
  const [newPayAutoActivate, setNewPayAutoActivate] = useState(true);

  // Edit Payment Form states (within detail modal)
  const [editPayClientName, setEditPayClientName] = useState('');
  const [editPayAmountPaid, setEditPayAmountPaid] = useState<number>(0);
  const [editPayCurrency, setEditPayCurrency] = useState('EUR');
  const [editPayExchangeRate, setEditPayExchangeRate] = useState<number>(1);
  const [editPayMethod, setEditPayMethod] = useState<'cash' | 'bank_transfer' | 'western_union' | 'paypal' | 'other'>('cash');
  const [editPayReference, setEditPayReference] = useState('');
  const [editPayPlanId, setEditPayPlanId] = useState<'basic' | 'pro' | 'enterprise'>('basic');
  const [editPayDuration, setEditPayDuration] = useState<'monthly' | 'yearly'>('monthly');
  const [editPayStatus, setEditPayStatus] = useState<'paid' | 'pending' | 'partial'>('paid');
  const [editPayDate, setEditPayDate] = useState('');
  const [editPayNotes, setEditPayNotes] = useState('');

  const [liveStats, setLiveStats] = useState<{
    bookingsCount: number;
    barbersCount: number;
    servicesCount: number;
    totalRevenue: number;
    totalExpenses: number;
    netBalance: number;
    loading: boolean;
  } | null>(null);

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    try {
      const d = new Date(Number(ts));
      if (isNaN(d.getTime())) return 'N/A';
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return 'N/A';
    }
  };

  const getTrialDaysRemaining = (endsAt: any) => {
    if (!endsAt) return 0;
    const diff = Number(endsAt) - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const renderTimeline = (p: any) => {
    const isPaid = p.status === 'paid';
    const tenantObj = tenants.find(t => t.id === p.tenantId);
    const isActivated = tenantObj?.subscription?.status === 'active' && tenantObj?.subscription?.manualPaymentId === p.id;
    
    return (
      <div className="bg-black/30 border border-white/5 p-5 rounded-2xl space-y-4">
        <h4 className="text-xs font-bold uppercase text-white/50 tracking-wider">Suivi du paiement</h4>
        <div className="flex items-center justify-between gap-4 text-xs font-bold">
          {/* Step 1: Created */}
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">✓</div>
            <div>Créé</div>
            <div className="text-[10px] text-white/40">{new Date(p.createdAt).toLocaleDateString()}</div>
          </div>
          
          <div className={`h-[2px] flex-1 ${isPaid ? 'bg-green-500/50' : 'bg-white/10'}`} />
          
          {/* Step 2: Paid */}
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
              isPaid ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-white/5 text-white/30 border-white/10'
            }`}>
              {isPaid ? '✓' : '•'}
            </div>
            <div>Payé</div>
            <div className="text-[10px] text-white/40">{isPaid ? new Date(p.paidAt).toLocaleDateString() : 'En attente'}</div>
          </div>
          
          <div className={`h-[2px] flex-1 ${isActivated ? 'bg-green-500/50' : 'bg-white/10'}`} />
          
          {/* Step 3: Activated */}
          <div className="flex flex-col items-center gap-1.5 flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${
              isActivated ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-white/5 text-white/30 border-white/10'
            }`}>
              {isActivated ? '✓' : '•'}
            </div>
            <div>Activé</div>
            <div className="text-[10px] text-white/40">{isActivated ? 'Abonnement Actif' : 'Non activé'}</div>
          </div>
        </div>
      </div>
    );
  };

  const handleViewTenant = async (tenant: any) => {
    setSelectedTenant(tenant);
    setIsEditMode(false);
    setLiveStats({
      bookingsCount: 0,
      barbersCount: 0,
      servicesCount: 0,
      totalRevenue: 0,
      totalExpenses: 0,
      netBalance: 0,
      loading: true
    });
    
    try {
      const tenantId = tenant.id;
      const [bookingsSnap, barbersSnap, servicesSnap, salesSnap, expensesSnap] = await Promise.all([
        getDocs(query(collection(db, 'bookings'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'barbers'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'services'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'sales'), where('tenantId', '==', tenantId))),
        getDocs(query(collection(db, 'expenses'), where('tenantId', '==', tenantId)))
      ]);
      
      const bookingsList = bookingsSnap.docs.map(d => d.data());
      const barbersCount = barbersSnap.docs.filter(d => !d.data().archived).length;
      const servicesCount = servicesSnap.docs.length;
      const salesList = salesSnap.docs.map(d => d.data());
      const expensesList = expensesSnap.docs.map(d => d.data());
      
      const bookingsCount = bookingsList.length;
      
      const completedBookings = bookingsList.filter((b: any) => b.status === 'completed' || b.status === 'approved');
      const serviceRev = completedBookings.reduce((sum: number, b: any) => sum + (b.pricePaid || 0), 0);
      const productRev = salesList.reduce((sum: number, s: any) => sum + ((s.sellPrice || 0) * (s.quantity || 0)), 0);
      const tips = completedBookings.reduce((sum: number, b: any) => sum + (b.tip || 0), 0);
      const totalRevenue = serviceRev + productRev + tips;
      
      const totalExpenses = expensesList.reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
      const netBalance = totalRevenue - totalExpenses;
      
      setLiveStats({
        bookingsCount,
        barbersCount,
        servicesCount,
        totalRevenue,
        totalExpenses,
        netBalance,
        loading: false
      });
    } catch (err) {
      console.error("Error loading live stats:", err);
      toast.error("Erreur lors du chargement des statistiques en temps réel");
      setLiveStats(prev => prev ? { ...prev, loading: false } : null);
    }
  };

  const handleEnterEditMode = () => {
    if (!selectedTenant) return;
    setEditName(selectedTenant.name || '');
    setEditPrimaryColor(selectedTenant.branding?.primaryColor || '#D4AF37');
    setEditMaxBarbers(selectedTenant.settings?.maxBarbersLimit || 2);
    setEditPlanId(selectedTenant.subscription?.planId || 'basic');
    setEditStatus(selectedTenant.subscription?.status || 'trialing');
    setEditOnlineBookingEnabled(selectedTenant.settings?.allowOnlineBooking !== false);
    setIsEditMode(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;
    setSaveLoading(true);
    try {
      const tenantRef = doc(db, 'tenants', selectedTenant.id);
      await updateDoc(tenantRef, {
        name: editName,
        'branding.businessName': editName,
        'branding.primaryColor': editPrimaryColor,
        'settings.maxBarbersLimit': Number(editMaxBarbers),
        'subscription.planId': editPlanId,
        'subscription.status': editStatus,
        'settings.allowOnlineBooking': editOnlineBookingEnabled
      });
      
      toast.success("Salon modifié avec succès");
      
      setSelectedTenant(prev => prev ? {
        ...prev,
        name: editName,
        branding: {
          ...prev.branding,
          businessName: editName,
          primaryColor: editPrimaryColor
        },
        settings: {
          ...prev.settings,
          maxBarbersLimit: Number(editMaxBarbers),
          allowOnlineBooking: editOnlineBookingEnabled
        },
        subscription: {
          ...prev.subscription,
          planId: editPlanId,
          status: editStatus
        }
      } : null);
      
      setIsEditMode(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleActivateManualPayment = async (p: any) => {
    try {
      const tenantRef = doc(db, 'tenants', p.tenantId);
      const newPeriodEnd = p.planDuration === 'monthly'
        ? Date.now() + 30 * 24 * 60 * 60 * 1000
        : Date.now() + 365 * 24 * 60 * 60 * 1000;

      await updateDoc(tenantRef, {
        'subscription.status': 'active',
        'subscription.planId': p.planId,
        'subscription.activatedManually': true,
        'subscription.manualPaymentId': p.id,
        'subscription.currentPeriodEnd': newPeriodEnd
      });
      
      if (p.status !== 'paid') {
        const payRef = doc(db, 'manual_payments', p.id);
        await updateDoc(payRef, { status: 'paid' });
      }
      
      toast.success(`Abonnement activé pour ${p.tenantName}`);
      fetchData();
      if (selectedPayment && selectedPayment.id === p.id) {
        setSelectedPayment(prev => prev ? { ...prev, status: 'paid' } : null);
      }
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'activation");
    }
  };

  const handleMarkPaymentAsPaid = async (p: any) => {
    try {
      const payRef = doc(db, 'manual_payments', p.id);
      await updateDoc(payRef, { status: 'paid' });
      
      toast.success("Paiement marqué comme payé");
      setSelectedPayment(prev => prev ? { ...prev, status: 'paid' } : null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la mise à jour");
    }
  };

  const handleCreateManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayTenantId) {
      toast.error("Veuillez sélectionner un salon.");
      return;
    }
    
    const selectedTen = tenants.find(t => t.id === newPayTenantId);
    if (!selectedTen) return;

    setSaveLoading(true);
    try {
      const amountInEur = newPayCurrency === 'EUR' ? newPayAmountPaid : newPayAmountPaid * newPayExchangeRate;
      
      const paymentData = {
        tenantId: newPayTenantId || '',
        tenantName: selectedTen.name || '',
        tenantSubdomain: selectedTen.subdomain || '',
        clientName: newPayClientName || '',
        amount: Number(amountInEur) || 0,
        originalAmount: Number(newPayAmountPaid) || 0,
        originalCurrency: newPayCurrency || 'EUR',
        exchangeRate: Number(newPayExchangeRate) || 1,
        paymentMethod: newPayMethod || 'cash',
        planId: newPayPlanId || 'basic',
        planDuration: newPayDuration || 'monthly',
        status: newPayStatus || 'paid',
        description: newPayNotes || '',
        reference: newPayReference || '',
        paidAt: newPayDate ? new Date(newPayDate).getTime() : Date.now(),
        createdAt: Date.now(),
        createdBy: user?.uid || '',
        createdByName: user?.name || user?.email || '',
        activationNote: newPayAutoActivate ? 'Activated automatically on creation' : ''
      };

      const docRef = await addDoc(collection(db, 'manual_payments'), paymentData);
      const newPaymentId = docRef.id;

      if (newPayAutoActivate && newPayStatus === 'paid') {
        const tenantRef = doc(db, 'tenants', newPayTenantId);
        await updateDoc(tenantRef, {
          'subscription.status': 'active',
          'subscription.planId': newPayPlanId,
          'subscription.activatedManually': true,
          'subscription.manualPaymentId': newPaymentId,
          'subscription.currentPeriodEnd': newPayDuration === 'monthly'
            ? Date.now() + 30 * 24 * 60 * 60 * 1000
            : Date.now() + 365 * 24 * 60 * 60 * 1000
        });
      }

      toast.success(`Paiement enregistré et abonnement configuré pour ${selectedTen.name}`);
      setIsNewPaymentModalOpen(false);
      
      // Reset form
      setNewPayTenantId('');
      setNewPayClientName('');
      setNewPayAmountPaid(0);
      setNewPayCurrency('EUR');
      setNewPayExchangeRate(1);
      setNewPayMethod('cash');
      setNewPayReference('');
      setNewPayPlanId('basic');
      setNewPayDuration('monthly');
      setNewPayStatus('paid');
      setNewPayDate(new Date().toISOString().split('T')[0]);
      setNewPayNotes('');
      setNewPayAutoActivate(true);

      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de l'enregistrement du paiement");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleEnterEditPaymentMode = () => {
    if (!selectedPayment) return;
    setEditPayClientName(selectedPayment.clientName || '');
    setEditPayAmountPaid(selectedPayment.originalAmount || selectedPayment.amount || 0);
    setEditPayCurrency(selectedPayment.originalCurrency || 'EUR');
    setEditPayExchangeRate(selectedPayment.exchangeRate || 1);
    setEditPayMethod(selectedPayment.paymentMethod || 'cash');
    setEditPayReference(selectedPayment.reference || '');
    setEditPayPlanId(selectedPayment.planId || 'basic');
    setEditPayDuration(selectedPayment.planDuration || 'monthly');
    setEditPayStatus(selectedPayment.status || 'paid');
    setEditPayDate(new Date(selectedPayment.paidAt).toISOString().split('T')[0]);
    setEditPayNotes(selectedPayment.description || '');
    setIsEditPaymentMode(true);
  };

  const handleSaveEditPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) return;
    setSaveLoading(true);
    try {
      const amountInEur = editPayCurrency === 'EUR' ? editPayAmountPaid : editPayAmountPaid * editPayExchangeRate;
      
      const payRef = doc(db, 'manual_payments', selectedPayment.id);
      await updateDoc(payRef, {
        clientName: editPayClientName || '',
        amount: Number(amountInEur) || 0,
        originalAmount: Number(editPayAmountPaid) || 0,
        originalCurrency: editPayCurrency || 'EUR',
        exchangeRate: Number(editPayExchangeRate) || 1,
        paymentMethod: editPayMethod || 'cash',
        planId: editPayPlanId || 'basic',
        planDuration: editPayDuration || 'monthly',
        status: editPayStatus || 'paid',
        description: editPayNotes || '',
        reference: editPayReference || '',
        paidAt: editPayDate ? new Date(editPayDate).getTime() : Date.now()
      });

      toast.success("Paiement modifié avec succès");
      
      setSelectedPayment(prev => prev ? {
        ...prev,
        clientName: editPayClientName,
        amount: Number(amountInEur),
        originalAmount: Number(editPayAmountPaid),
        originalCurrency: editPayCurrency,
        exchangeRate: Number(editPayExchangeRate),
        paymentMethod: editPayMethod,
        planId: editPayPlanId,
        planDuration: editPayDuration,
        status: editPayStatus,
        description: editPayNotes,
        reference: editPayReference,
        paidAt: new Date(editPayDate).getTime()
      } : null);

      setIsEditPaymentMode(false);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la modification");
    } finally {
      setSaveLoading(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const tenantsSnap = await getDocs(collection(db, 'tenants'));
      setTenants(tenantsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      
      const bookingsSnap = await getDocs(collection(db, 'bookings'));
      setBookings(bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const manualPaymentsSnap = await getDocs(collection(db, 'manual_payments'));
      setManualPayments(manualPaymentsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error(err);
      toast.error("Erreur de chargement des données");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (user?.role !== 'superadmin') {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto" />
          <h1 className="text-2xl font-black">Accès non autorisé</h1>
          <p className="text-white/50 text-sm">Seuls les super-administrateurs de Barberboard peuvent accéder à cet espace.</p>
        </div>
      </div>
    );
  }

  // Actions
  const handleFreeAccess = async (tenantId: string) => {
    try {
      await updateDoc(doc(db, 'tenants', tenantId), {
        'subscription.status': 'active',
        'subscription.planId': 'pro',
        freeAccess: true,
        freeAccessGrantedAt: Date.now()
      });
      toast.success("Accès gratuit accordé");
      fetchData();
    } catch (err) {
      toast.error("Erreur");
    }
  };

  const handleSuspend = async (tenantId: string) => {
    if (!confirm("Voulez-vous vraiment suspendre ce salon ?")) return;
    try {
      await updateDoc(doc(db, 'tenants', tenantId), {
        'subscription.status': 'canceled'
      });
      toast.success("Salon suspendu");
      fetchData();
    } catch (err) {
      toast.error("Erreur");
    }
  };

  const handleDelete = async (tenantId: string, shopName: string) => {
    const input = prompt(`Tapez le nom du salon "${shopName}" pour confirmer :`);
    if (input !== shopName) {
      toast.error("Nom incorrect, annulation.");
      return;
    }
    try {
      await deleteDoc(doc(db, 'tenants', tenantId));
      toast.success("Salon supprimé");
      fetchData();
    } catch (err) {
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleProvisionSubdomain = async (tenantId: string, subdomain: string) => {
    setSaveLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/provision-subdomain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ subdomain, tenantId })
      });
      const data = await res.json();
      
      if (res.ok && data.ok) {
        await updateDoc(doc(db, 'tenants', tenantId), {
          'domain.status': 'active',
          'domain.vercelVerified': data.verified
        });
        toast.success(`Domaine configuré : ${data.domain}`);
        fetchData();
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erreur lors du provisionnement');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleRemoveSubdomain = async (tenantId: string, subdomain: string) => {
    if (!confirm(`Voulez-vous vraiment détacher le domaine de ${subdomain} de Vercel ?`)) return;
    setSaveLoading(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/remove-subdomain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({ subdomain, tenantId })
      });
      const data = await res.json();
      
      if (res.ok && data.ok) {
        await updateDoc(doc(db, 'tenants', tenantId), {
          'domain.status': 'removed',
          'domain.vercelVerified': false
        });
        toast.success("Domaine détaché avec succès.");
        fetchData();
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erreur lors du détachement');
    } finally {
      setSaveLoading(false);
    }
  };

  const grantFreeAccessForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const tenant = tenants.find(t => t.subdomain === freeSubdomain);
    if (!tenant) {
      toast.error("Sous-domaine introuvable");
      return;
    }
    try {
      await updateDoc(doc(db, 'tenants', tenant.id), {
        'subscription.status': 'active',
        'subscription.planId': freePlan,
        freeAccess: true,
        freeAccessGrantedAt: Date.now()
      });
      toast.success(`Accès ${freePlan} accordé à ${tenant.name}`);
      setFreeSubdomain('');
      fetchData();
    } catch (err) {
      toast.error("Erreur");
    }
  };

  const revokeFreeAccess = async (tenantId: string) => {
    if (!confirm("Révoquer l'accès gratuit ?")) return;
    try {
      await updateDoc(doc(db, 'tenants', tenantId), {
        freeAccess: false,
        'subscription.status': 'past_due'
      });
      toast.success("Accès révoqué");
      fetchData();
    } catch (err) {
      toast.error("Erreur");
    }
  };

  // Computations
  const activeTenants = tenants.filter(t => t.subscription?.status === 'active');
  const trialingTenants = tenants.filter(t => t.subscription?.status === 'trialing');
  const planPrices: Record<string, number> = {
    'basic': 29, 'basic-monthly': 29,
    'pro': 59, 'pro-monthly': 59,
    'enterprise': 99, 'enterprise-monthly': 99
  };

  const mrrFromSubscriptions = tenants
    .filter(t => t.subscription?.status === 'active' && t.freeAccess !== true)
    .reduce((sum, t) => sum + (planPrices[t.subscription?.planId?.toLowerCase()] || 0), 0);

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const mrrFromManual = manualPayments
    .filter(p => {
      const date = new Date(p.paidAt);
      return p.status === 'paid' &&
             p.planDuration === 'monthly' &&
             date.getMonth() === currentMonth &&
             date.getFullYear() === currentYear;
    })
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalMRR = mrrFromSubscriptions + mrrFromManual;
  const totalARR = totalMRR * 12;

  console.log('Tenants for MRR:', tenants.map(t => ({
    name: t.name,
    status: t.subscription?.status,
    planId: t.subscription?.planId,
    freeAccess: t.freeAccess
  })));

  console.log('MRR breakdown:', { mrrFromSubscriptions, mrrFromManual, totalMRR });

  const mrrManuel = mrrFromManual;

  const freeTenants = tenants.filter(t => t.freeAccess);
  const planCounts = {
    basic: activeTenants.filter(t => t.subscription?.planId === 'basic' && !t.freeAccess).length,
    pro: activeTenants.filter(t => t.subscription?.planId === 'pro' && !t.freeAccess).length,
    enterprise: activeTenants.filter(t => t.subscription?.planId === 'enterprise' && !t.freeAccess).length,
    free: freeTenants.length
  };

  const totalManualEncaisse = manualPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const pendingPaymentsCount = manualPayments
    .filter(p => p.status === 'pending').length;

  const activeManualTenantsCount = new Set(
    manualPayments
      .filter(p => p.status === 'paid')
      .map(p => p.tenantId)
  ).size;

  // Tenant filters and handlers
  const handleSearchChange = (val: string) => {
    setTenantSearch(val);
    setTenantPage(1);
  };
  const handleStatusFilterChange = (val: string) => {
    setTenantStatusFilter(val);
    setTenantPage(1);
  };
  const handlePlanFilterChange = (val: string) => {
    setTenantPlanFilter(val);
    setTenantPage(1);
  };

  const handleSort = (column: string) => {
    if (tenantSortColumn === column) {
      setTenantSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTenantSortColumn(column);
      setTenantSortDirection('asc');
    }
  };

  const renderSortArrow = (column: string) => {
    if (tenantSortColumn !== column) return <span className="text-white/20 text-xs">↕</span>;
    return tenantSortDirection === 'asc' ? <span className="text-[#D4AF37] text-xs">▲</span> : <span className="text-[#D4AF37] text-xs">▼</span>;
  };

  const handleCleanDuplicates = async () => {
    const defaultTenants = tenants.filter(t => t.subdomain === 'elite-cuts-default');
    if (defaultTenants.length <= 1) {
      toast.info("Aucun doublon trouvé.");
      return;
    }

    const confirmMessage = "Supprimer les salons dupliqués avec subdomain 'elite-cuts-default' ? Cette action est irréversible.";
    if (!window.confirm(confirmMessage)) return;

    setSaveLoading(true);
    try {
      const sortedDefaultTenants = [...defaultTenants].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const tenantsToDelete = sortedDefaultTenants.slice(1);

      let deletedCount = 0;
      for (const t of tenantsToDelete) {
        await deleteDoc(doc(db, 'tenants', t.id));
        deletedCount++;
      }

      toast.success(`${deletedCount} doublons supprimés`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la suppression des doublons.");
    } finally {
      setSaveLoading(false);
    }
  };

  // Filtered tenants computation
  const filteredTenants = tenants.filter(t => {
    const searchLower = tenantSearch.toLowerCase();
    const matchesSearch = !tenantSearch ||
      (t.name || '').toLowerCase().includes(searchLower) ||
      (t.subdomain || '').toLowerCase().includes(searchLower);

    const status = t.subscription?.status || 'inactive';
    const matchesStatus = tenantStatusFilter === 'all' || status === tenantStatusFilter;

    const plan = t.subscription?.planId || 'none';
    const matchesPlan = tenantPlanFilter === 'all' || plan.toLowerCase().includes(tenantPlanFilter.toLowerCase());

    return matchesSearch && matchesStatus && matchesPlan;
  });

  // Sorted tenants computation
  const sortedTenants = [...filteredTenants].sort((a, b) => {
    let valA: any = '';
    let valB: any = '';

    if (tenantSortColumn === 'name') {
      valA = (a.name || '').toLowerCase();
      valB = (b.name || '').toLowerCase();
    } else if (tenantSortColumn === 'createdAt') {
      valA = a.createdAt || 0;
      valB = b.createdAt || 0;
    } else if (tenantSortColumn === 'status') {
      valA = (a.subscription?.status || 'inactive').toLowerCase();
      valB = (b.subscription?.status || 'inactive').toLowerCase();
    }

    if (valA < valB) return tenantSortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return tenantSortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginated tenants computation
  const tenantsPerPage = 5;
  const totalTenantPages = Math.ceil(sortedTenants.length / tenantsPerPage) || 1;
  const paginatedTenants = sortedTenants.slice(
    (tenantPage - 1) * tenantsPerPage,
    tenantPage * tenantsPerPage
  );

  const filteredPayments = manualPayments.filter(p => {
    const searchLower = paySearch.toLowerCase();
    const matchesSearch = !paySearch || 
      (p.tenantName || '').toLowerCase().includes(searchLower) ||
      (p.clientName || '').toLowerCase().includes(searchLower);

    const matchesStatus = payStatusFilter === 'all' || p.status === payStatusFilter;
    const matchesMethod = payMethodFilter === 'all' || p.paymentMethod === payMethodFilter;
    const matchesCurrency = payCurrencyFilter === 'all' || (p.originalCurrency || 'EUR') === payCurrencyFilter;
    const matchesDateFrom = !payDateFrom || p.paidAt >= new Date(payDateFrom).getTime();
    const matchesDateTo = !payDateTo || p.paidAt <= new Date(payDateTo + 'T23:59:59').getTime();

    return matchesSearch && matchesStatus && matchesMethod && matchesCurrency && matchesDateFrom && matchesDateTo;
  });

  // Actions inside the dashboard
  const handleMarkPaid = async (paymentId: string, tenantId: string, planId: string, planDuration: string) => {
    setSaveLoading(true);
    try {
      const payRef = doc(db, 'manual_payments', paymentId);
      await updateDoc(payRef, {
        status: 'paid',
        paidAt: Date.now()
      });
      
      const tenantRef = doc(db, 'tenants', tenantId);
      await updateDoc(tenantRef, {
        'subscription.status': 'active',
        'subscription.planId': planId || 'basic',
        'subscription.activatedManually': true,
        'subscription.manualPaymentId': paymentId,
        'subscription.currentPeriodEnd': planDuration === 'monthly'
          ? Date.now() + 30 * 24 * 60 * 60 * 1000
          : Date.now() + 365 * 24 * 60 * 60 * 1000
      });

      toast.success("Paiement marqué comme payé et abonnement activé !");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la mise à jour du paiement.");
    } finally {
      setSaveLoading(false);
    }
  };

  const handleReactivateTenant = async (tenantId: string, currentPlan: string) => {
    setSaveLoading(true);
    try {
      const tenantRef = doc(db, 'tenants', tenantId);
      await updateDoc(tenantRef, {
        'subscription.status': 'active',
        'subscription.planId': currentPlan || 'basic',
        'subscription.trialEndsAt': 0
      });
      toast.success("Salon réactivé avec succès !");
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error("Erreur lors de la réactivation du salon.");
    } finally {
      setSaveLoading(false);
    }
  };

  // Dashboard computations
  const getRevenueChartData = () => {
    const data = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('fr-FR', { month: 'short', year: '2-digit' });
      const monthNum = d.getMonth();
      const yearNum = d.getFullYear();

      const totalForMonth = manualPayments
        .filter(p => {
          if (p.status !== 'paid' || !p.paidAt) return false;
          const pDate = new Date(p.paidAt);
          return pDate.getMonth() === monthNum && pDate.getFullYear() === yearNum;
        })
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      data.push({
        name: String(monthLabel || ''),
        montant: Number(totalForMonth) || 0
      });
    }
    return data;
  };
  const revenueChartData = getRevenueChartData();
  const totalEncaisseLaunch = manualPayments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const recentRegistrations = [...tenants]
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 5);

  const recentPayments = [...manualPayments]
    .sort((a, b) => (b.paidAt || 0) - (a.paidAt || 0))
    .slice(0, 5);

  const nowMs = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const expiringTrials = tenants.filter(t => {
    const status = t.subscription?.status;
    const trialEndsAt = t.subscription?.trialEndsAt || 0;
    if (status !== 'trialing') return false;
    const diff = trialEndsAt - nowMs;
    return diff > 0 && diff <= sevenDaysMs;
  });

  const now = new Date();
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const newThisMonth = tenants.filter(t => t.createdAt && t.createdAt >= startOfCurrentMonth).length;
  const activeLastMonth = tenants.filter(t => t.createdAt && t.createdAt < startOfCurrentMonth && t.subscription?.status === 'active').length || 1;
  const retentionRate = Math.min(100, Math.max(0, Math.round(((activeTenants.length - newThisMonth) / activeLastMonth) * 100)));

  const getTopTenants = () => {
    const bookingCounts: Record<string, number> = {};
    bookings.forEach(b => {
      if (b.tenantId) {
        bookingCounts[b.tenantId] = (bookingCounts[b.tenantId] || 0) + 1;
      }
    });

    return tenants
      .map(t => ({
        ...t,
        bookingsCount: bookingCounts[t.id] || 0
      }))
      .sort((a, b) => b.bookingsCount - a.bookingsCount)
      .slice(0, 5);
  };
  const topTenants = getTopTenants();

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between border-b border-white/10 pb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/admin')}
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all text-white/80 hover:text-white"
            >
              <span className="sm:hidden">←</span><span className="hidden sm:inline">← Dashboard</span>
            </button>
            <div className="flex items-center gap-3">
              <Zap className="w-8 h-8 text-yellow-400 fill-yellow-400" />
              <h1 className="text-3xl font-black tracking-tight">SUPER ADMIN</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={signOut}
              className="px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500 hover:text-black border border-rose-500/20 rounded-xl text-sm font-bold transition-all text-rose-400"
            >
              Se déconnecter
            </button>
            <button onClick={fetchData} className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-[#D4AF37]' : 'text-white/60'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 border-b border-white/10" style={{ scrollbarWidth: 'none' }}>
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'tenants', label: 'Salons', icon: Users },
            { id: 'revenue', label: 'Revenus & MRR', icon: TrendingUp },
            { id: 'bookings', label: 'Réservations Globales', icon: Calendar },
            { id: 'free', label: 'Accès Gratuit', icon: Gift },
            { id: 'payments', label: '💳 Paiements', icon: CreditCard }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all shrink-0 ${
                activeTab === tab.id ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/20' : 'bg-white/5 text-white/50 hover:bg-white/10'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <main className="min-h-[500px]">
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="h-28 bg-white/5 border border-white/10 rounded-2xl"></div>
              ))}
            </div>
          ) : (
            <>
              {activeTab === 'dashboard' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
                  {/* Section 1 — Welcome header */}
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between p-6 bg-gradient-to-r from-yellow-500/10 via-black to-black border border-white/10 rounded-2xl gap-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl font-black flex items-center gap-2 text-white">
                        Bonjour, {user?.name || 'Admin'} <Sparkles className="w-5 h-5 text-yellow-400 animate-pulse" />
                      </h2>
                      <p className="text-white/60 text-sm">
                        Voici l'état de votre plateforme en temps réel.
                      </p>
                    </div>
                    <div className="text-left md:text-right">
                      <div className="text-[#D4AF37] font-mono text-lg font-bold">
                        {currentTime.toLocaleTimeString('fr-FR')}
                      </div>
                      <div className="text-white/40 text-xs font-mono uppercase tracking-wider">
                        {currentTime.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Section 2 — KPI cards row */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37]">Vue d'ensemble</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                      {/* Total Salons */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 hover:border-[#D4AF37]/45 p-6 rounded-2xl transition-all duration-300 shadow-xl group hover:shadow-[#D4AF37]/5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Total Salons</span>
                          <Users className="w-5 h-5 text-white/40" />
                        </div>
                        <div className="text-3xl font-black text-white">
                          <AnimatedCounter value={tenants.length} />
                        </div>
                      </div>

                      {/* Salons Actifs */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 hover:border-green-500/40 p-6 rounded-2xl transition-all duration-300 shadow-xl group hover:shadow-green-500/5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Salons Actifs</span>
                          <CheckCircle className="w-5 h-5 text-green-400" />
                        </div>
                        <div className="text-3xl font-black text-green-400">
                          <AnimatedCounter value={activeTenants.length} />
                        </div>
                      </div>

                      {/* Essais en cours */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 hover:border-yellow-500/40 p-6 rounded-2xl transition-all duration-300 shadow-xl group hover:shadow-yellow-500/5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Essais en cours</span>
                          <Hourglass className="w-5 h-5 text-yellow-400" />
                        </div>
                        <div className="text-3xl font-black text-yellow-400">
                          <AnimatedCounter value={trialingTenants.length} />
                        </div>
                      </div>

                      {/* Expirés/Suspendus */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 hover:border-rose-500/40 p-6 rounded-2xl transition-all duration-300 shadow-xl group hover:shadow-rose-500/5">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Expirés / Suspendus</span>
                          <XCircle className="w-5 h-5 text-rose-500" />
                        </div>
                        <div className="text-3xl font-black text-rose-500">
                          <AnimatedCounter value={tenants.filter(t => t.subscription?.status === 'canceled' || t.subscription?.status === 'past_due').length} />
                        </div>
                      </div>

                      {/* MRR Total */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 hover:border-[#D4AF37]/60 p-6 rounded-2xl transition-all duration-300 shadow-xl group hover:shadow-[#D4AF37]/10 border-l-4 border-l-[#D4AF37]">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">MRR Estimé</span>
                          <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <div className="text-3xl font-black text-[#D4AF37]">
                          <AnimatedCounter value={totalMRR} suffix=" €" />
                        </div>
                      </div>

                      {/* ARR Projeté */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 hover:border-[#D4AF37]/60 p-6 rounded-2xl transition-all duration-300 shadow-xl group hover:shadow-[#D4AF37]/10 border-l-4 border-l-[#D4AF37]">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider">ARR Projeté</span>
                          <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <div className="text-3xl font-black text-[#D4AF37]">
                          <AnimatedCounter value={totalARR} suffix=" €" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Section 3 — Revenue chart */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37]">Évolution des revenus</h3>
                    <div className="bg-[#111]/80 backdrop-blur border border-white/10 p-6 rounded-2xl space-y-4 shadow-xl">
                      {revenueChartData.length === 0 || revenueChartData.every(d => d.montant === 0) ? (
                        <div className="h-64 flex flex-col items-center justify-center text-white/30 text-sm">
                          <TrendingUp className="w-12 h-12 mb-2 text-white/20" />
                          Aucune donnée de paiement enregistrée pour les 6 derniers mois.
                        </div>
                      ) : (
                        <div className="h-64 w-full">
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={revenueChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} />
                              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} tickLine={false} axisLine={false} unit=" €" />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#141414', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                labelStyle={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', fontWeight: 'bold' }}
                                itemStyle={{ color: '#D4AF37', fontSize: '13px', fontWeight: 'black' }}
                                formatter={(value: any) => [`${value} €`, 'Revenus']}
                              />
                              <Bar dataKey="montant" fill="#D4AF37" radius={[6, 6, 0, 0]} maxBarSize={45} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      <div className="text-white/50 text-xs font-mono border-t border-white/5 pt-4 flex flex-wrap justify-between items-center gap-2">
                        <span>Revenus mensuels issus des paiements manuels</span>
                        <span>Total encaissé depuis le lancement: <strong className="text-white text-sm font-bold">{totalEncaisseLaunch.toLocaleString('fr-FR')} €</strong></span>
                      </div>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Section 4 — Two column layout */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left column — Activité récente */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37]">Activité récente</h3>
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 p-6 rounded-2xl space-y-6 shadow-xl min-h-[420px]">
                        
                        {/* Tenant registrations */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <Users className="w-3.5 h-3.5" /> Dernières inscriptions
                          </h4>
                          {recentRegistrations.length === 0 ? (
                            <div className="text-xs text-white/30 italic py-2">Aucune inscription récente.</div>
                          ) : (
                            <div className="divide-y divide-white/5">
                              {recentRegistrations.map((t, idx) => (
                                <div key={t.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                                  <div>
                                    <div className="font-bold text-white">{t.name}</div>
                                    <div className="text-white/40 font-mono text-[10px]">{t.subdomain}</div>
                                  </div>
                                  <div className="text-right flex items-center gap-2">
                                    <span className="text-white/50">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}</span>
                                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                                      t.subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                      t.subscription?.status === 'trialing' ? 'bg-yellow-500/20 text-yellow-400' :
                                      'bg-red-500/20 text-red-400'
                                    }`}>
                                      {t.subscription?.status || 'trialing'}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Recent Payments */}
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <CreditCard className="w-3.5 h-3.5" /> Derniers paiements manuels
                          </h4>
                          {recentPayments.length === 0 ? (
                            <div className="text-xs text-white/30 italic py-2">Aucun paiement récent.</div>
                          ) : (
                            <div className="divide-y divide-white/5">
                              {recentPayments.map((p, idx) => (
                                <div key={p.id || idx} className="py-2.5 flex items-center justify-between text-xs">
                                  <div>
                                    <div className="font-bold text-white">{p.tenantName || p.clientName}</div>
                                    <div className="text-white/40 text-[10px] uppercase font-mono">{p.paymentMethod}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-[#D4AF37]">{p.amount || 0} €</div>
                                    <div className="text-white/40 text-[10px]">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : 'N/A'}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>

                    {/* Right column — Alertes & Actions requises */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold uppercase tracking-widest text-rose-500 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-500" /> Alertes & Actions requises
                      </h3>
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 p-6 rounded-2xl space-y-6 shadow-xl min-h-[420px]">
                        
                        {/* Expiring Trials */}
                        <div className="space-y-3">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-yellow-500/70 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <Clock className="w-3.5 h-3.5 text-yellow-500/70" /> Essais expirant bientôt (≤ 7 jours)
                          </h4>
                          {expiringTrials.length === 0 ? (
                            <div className="text-xs text-white/30 italic py-2">Aucun essai expirant dans les 7 prochains jours.</div>
                          ) : (
                            <div className="divide-y divide-white/5 max-h-[120px] overflow-y-auto pr-1">
                              {expiringTrials.map(t => {
                                const daysRem = Math.ceil(((t.subscription?.trialEndsAt || 0) - Date.now()) / (24 * 60 * 60 * 1000));
                                return (
                                  <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                                    <div>
                                      <div className="font-bold text-white">{t.name}</div>
                                      <div className="text-yellow-500 font-mono text-[10px]">{daysRem} jours restants</div>
                                    </div>
                                    <a
                                      href={`mailto:?subject=Expiration%20p%C3%A9riode%20d'essai%20-%20Elite%20Cuts&body=Bonjour%20${encodeURIComponent(t.name || '')},%0A%0A`}
                                      className="px-2.5 py-1 bg-white/5 hover:bg-yellow-500 hover:text-black rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                                    >
                                      <Mail className="w-3 h-3" /> Contacter
                                    </a>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Pending Payments */}
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-orange-400 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <CreditCard className="w-3.5 h-3.5 text-orange-400" /> Paiements en attente
                          </h4>
                          {manualPayments.filter(p => p.status === 'pending').length === 0 ? (
                            <div className="text-xs text-white/30 italic py-2">Aucun paiement en attente.</div>
                          ) : (
                            <div className="divide-y divide-white/5 max-h-[120px] overflow-y-auto pr-1">
                              {manualPayments.filter(p => p.status === 'pending').map(p => (
                                <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                                  <div>
                                    <div className="font-bold text-white">{p.tenantName || p.clientName}</div>
                                    <div className="text-white/40 font-mono text-[10px]">{p.amount || 0} € ({p.planId} - {p.planDuration})</div>
                                  </div>
                                  <button
                                    onClick={() => handleMarkPaid(p.id, p.tenantId, p.planId, p.planDuration)}
                                    disabled={saveLoading}
                                    className="px-2.5 py-1 bg-green-500/10 text-green-400 hover:bg-green-500 hover:text-black rounded-lg text-[10px] font-bold transition-all"
                                  >
                                    Marquer payé
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Suspended Tenants */}
                        <div className="space-y-3 pt-2">
                          <h4 className="text-xs font-bold uppercase tracking-wider text-rose-500/70 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <XCircle className="w-3.5 h-3.5 text-rose-500/70" /> Salons suspendus
                          </h4>
                          {tenants.filter(t => t.subscription?.status === 'canceled').length === 0 ? (
                            <div className="text-xs text-white/30 italic py-2">Aucun salon suspendu.</div>
                          ) : (
                            <div className="divide-y divide-white/5 max-h-[120px] overflow-y-auto pr-1">
                              {tenants.filter(t => t.subscription?.status === 'canceled').map(t => (
                                <div key={t.id} className="py-2 flex items-center justify-between text-xs">
                                  <div>
                                    <div className="font-bold text-white">{t.name}</div>
                                    <div className="text-white/40 font-mono text-[10px]">{t.subdomain}</div>
                                  </div>
                                  <button
                                    onClick={() => handleReactivateTenant(t.id, t.subscription?.planId)}
                                    disabled={saveLoading}
                                    className="px-2.5 py-1 bg-rose-500/10 text-rose-400 hover:bg-[#D4AF37] hover:text-black rounded-lg text-[10px] font-bold transition-all"
                                  >
                                    Réactiver
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Section 5 — Performance metrics row */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37]">Indicateurs de performance</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                      
                      {/* Taux de conversion */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 p-6 rounded-2xl shadow-xl flex items-center justify-between gap-4 hover:border-[#D4AF37]/35 transition-all duration-300">
                        <div className="space-y-1">
                          <span className="text-white/40 text-xs font-bold uppercase tracking-wider block">Taux de conversion</span>
                          <div className="text-2xl font-black text-white">
                            {((activeTenants.length / (tenants.length || 1)) * 100).toFixed(1)} %
                          </div>
                          <p className="text-[10px] text-white/40">Pourcentage de salons actifs sur la plateforme</p>
                        </div>
                        <div className="relative w-16 h-16 flex items-center justify-center">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                            <path className="text-white/5" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                            <path className="text-[#D4AF37]" strokeDasharray={`${Math.round((activeTenants.length / (tenants.length || 1)) * 100)}, 100`} strokeWidth="3" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                          </svg>
                        </div>
                      </div>

                      {/* Valeur moyenne par salon */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 p-6 rounded-2xl shadow-xl space-y-1 hover:border-[#D4AF37]/35 transition-all duration-300">
                        <span className="text-white/40 text-xs font-bold uppercase tracking-wider block">Valeur moyenne salon (ARPU)</span>
                        <div className="text-2xl font-black text-[#D4AF37]">
                          {(totalMRR / (activeTenants.length || 1)).toFixed(2)} €
                        </div>
                        <p className="text-[10px] text-white/40 font-mono">Revenu mensuel moyen généré par salon actif</p>
                      </div>

                      {/* Rétention */}
                      <div className="bg-[#111]/80 backdrop-blur border border-white/10 p-6 rounded-2xl shadow-xl space-y-1 hover:border-[#D4AF37]/35 transition-all duration-300">
                        <span className="text-white/40 text-xs font-bold uppercase tracking-wider block">Taux de Rétention</span>
                        <div className={`text-2xl font-black ${retentionRate >= 80 ? 'text-green-400' : 'text-rose-500'}`}>
                          {retentionRate} %
                        </div>
                        <p className="text-[10px] text-white/40">Taux de rétention des abonnés par rapport au mois précédent</p>
                      </div>

                    </div>
                  </div>

                  <hr className="border-white/5" />

                  {/* Section 6 — Top salons table */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-[#D4AF37]">Salons les plus actifs</h3>
                    <div className="bg-[#111]/80 backdrop-blur border border-white/10 rounded-2xl overflow-hidden shadow-xl">
                      <div className="overflow-x-auto w-full">
                      <table className="min-w-[600px] w-full text-left text-sm">
                        <thead className="bg-white/5 border-b border-white/10 text-white/50 text-xs font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-4 w-20">Rang</th>
                            <th className="p-4">Salon</th>
                            <th className="p-4">Plan</th>
                            <th className="p-4">Réservations</th>
                            <th className="p-4 text-right">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {topTenants.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-white/30">Aucun salon actif trouvé.</td>
                            </tr>
                          ) : (
                            topTenants.map((t, idx) => (
                              <tr key={t.id} className={`hover:bg-white/5 transition-colors ${idx === 0 ? 'bg-[#D4AF37]/5 border-l-4 border-l-[#D4AF37]' : ''}`}>
                                <td className="p-4 font-black">
                                  {idx === 0 ? '🥇 1' : idx === 1 ? '🥈 2' : idx === 2 ? '🥉 3' : `${idx + 1}`}
                                </td>
                                <td className="p-4">
                                  <div className="font-bold text-white">{t.name}</div>
                                  <div className="text-white/40 text-xs">{t.subdomain}</div>
                                </td>
                                <td className="p-4 uppercase text-xs font-bold text-white/60">
                                  {t.subscription?.planId || 'basic'}
                                </td>
                                <td className="p-4 font-bold text-[#D4AF37]">
                                  {t.bookingsCount} rés.
                                </td>
                                <td className="p-4 text-right">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    t.subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                    t.subscription?.status === 'trialing' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-red-500/20 text-red-400'
                                  }`}>
                                    {t.subscription?.status || 'trialing'}
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </div>

                </motion.div>
              )}

              {activeTab === 'tenants' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold">Tous les Salons ({tenants.length})</h2>
                  </div>

                  {/* Filters Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl">
                    <div className="flex flex-wrap items-center gap-3 flex-1">
                      {/* Search */}
                      <div className="relative min-w-[240px] flex-1">
                        <Search className="w-4 h-4 text-white/40 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Rechercher un salon..."
                          value={tenantSearch}
                          onChange={e => handleSearchChange(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm focus:border-[#D4AF37] focus:outline-none transition-colors"
                        />
                      </div>

                      {/* Status Dropdown */}
                      <select
                        value={tenantStatusFilter}
                        onChange={e => handleStatusFilterChange(e.target.value)}
                        className="px-3 py-2 bg-[#141414] border border-white/10 rounded-xl text-sm focus:border-[#D4AF37] focus:outline-none transition-colors text-white"
                      >
                        <option value="all">Tous les Statuts</option>
                        <option value="active">Actif</option>
                        <option value="trialing">Trialing</option>
                        <option value="canceled">Canceled</option>
                        <option value="past_due">Past_due</option>
                      </select>

                      {/* Plan Dropdown */}
                      <select
                        value={tenantPlanFilter}
                        onChange={e => handlePlanFilterChange(e.target.value)}
                        className="px-3 py-2 bg-[#141414] border border-white/10 rounded-xl text-sm focus:border-[#D4AF37] focus:outline-none transition-colors text-white"
                      >
                        <option value="all">Tous les Plans</option>
                        <option value="basic">Basic</option>
                        <option value="pro">Pro</option>
                        <option value="enterprise">Enterprise</option>
                      </select>
                    </div>

                    {/* Cleanup Button */}
                    <button
                      onClick={handleCleanDuplicates}
                      disabled={saveLoading}
                      className="px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-xl text-sm font-bold hover:bg-rose-500 hover:text-black transition-all flex items-center gap-2"
                    >
                      <span>🗑 Nettoyer les doublons</span>
                    </button>
                  </div>

                  <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto w-full">
                    <table className="min-w-[600px] w-full text-left text-sm">
                      <thead className="bg-white/5 border-b border-white/10 text-white/50">
                        <tr>
                          <th 
                            className="p-4 font-medium cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('name')}
                          >
                            <div className="flex items-center gap-1">
                              Salon {renderSortArrow('name')}
                            </div>
                          </th>
                          <th className="p-4 font-medium">Sous-domaine</th>
                          <th className="p-4 font-medium">Plan</th>
                          <th 
                            className="p-4 font-medium cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('status')}
                          >
                            <div className="flex items-center gap-1">
                              Statut {renderSortArrow('status')}
                            </div>
                          </th>
                          <th 
                            className="p-4 font-medium cursor-pointer hover:text-white transition-colors"
                            onClick={() => handleSort('createdAt')}
                          >
                            <div className="flex items-center gap-1">
                              Date création {renderSortArrow('createdAt')}
                            </div>
                          </th>
                          <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {paginatedTenants.map(t => (
                          <tr key={t.id} className="hover:bg-white/5">
                            <td className="p-4 font-bold">{t.name}</td>
                            <td className="p-4">
                              <div className="text-white/60">{t.subdomain}</div>
                              {t.domain && (
                                <div className="flex items-center gap-1 mt-1 text-[10px] font-mono">
                                  <span className={`w-1.5 h-1.5 rounded-full ${t.domain.status === 'active' ? 'bg-green-500' : t.domain.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`}></span>
                                  <span className="text-white/40 uppercase">{t.domain.status} {t.domain.vercelVerified && '(Verifié)'}</span>
                                </div>
                              )}
                            </td>
                            <td className="p-4 uppercase text-xs font-black">{t.subscription?.planId || 'N/A'} {t.freeAccess && <span className="text-yellow-400 ml-1">(Free)</span>}</td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                t.subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' :
                                t.subscription?.status === 'trialing' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-red-500/20 text-red-400'
                              }`}>
                                {t.subscription?.status || 'Inconnu'}
                              </span>
                            </td>
                            <td className="p-4 text-white/50">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'N/A'}</td>
                            <td className="p-4"><div className="flex flex-wrap gap-1 justify-end">
                              {t.domain?.status === 'failed' && (
                                <button onClick={() => handleProvisionSubdomain(t.id, t.subdomain)} className="px-3 py-1 bg-yellow-500/10 text-yellow-400 rounded-lg text-xs font-bold hover:bg-yellow-500/20" title="Relancer la configuration Vercel">↻ Vercel</button>
                              )}
                              {t.domain?.status === 'active' && (
                                <button onClick={() => handleRemoveSubdomain(t.id, t.subdomain)} className="px-3 py-1 bg-white/5 text-white/50 rounded-lg text-xs font-bold hover:bg-red-500/20 hover:text-red-400" title="Détacher de Vercel">Disconnect</button>
                              )}
                              <button onClick={() => handleViewTenant(t)} className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-500/20">👁 Voir</button>
                              <button onClick={() => handleFreeAccess(t.id)} className="px-3 py-1 bg-green-500/10 text-green-400 rounded-lg text-xs font-bold hover:bg-green-500/20">✓ Accès gratuit</button>
                              <button onClick={() => handleSuspend(t.id)} className="px-3 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-xs font-bold hover:bg-orange-500/20">⏸ Suspendre</button>
                              <button onClick={() => handleDelete(t.id, t.name)} className="px-3 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/20">🗑 Supprimer</button>
                            </div></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>

                  {/* Pagination Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 border border-white/10 p-4 rounded-2xl text-sm">
                    <div className="text-white/60">
                      Page <span className="font-bold text-white">{tenantPage}</span> sur <span className="font-bold text-white">{totalTenantPages}</span>
                      <span className="mx-2 text-white/20">|</span>
                      <span className="font-bold text-[#D4AF37]">{tenants.length}</span> salons au total
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setTenantPage(p => Math.max(1, p - 1))}
                        disabled={tenantPage === 1}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        Précédent
                      </button>
                      <button
                        onClick={() => setTenantPage(p => Math.min(totalTenantPages, p + 1))}
                        disabled={tenantPage === totalTenantPages}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl disabled:opacity-30 disabled:pointer-events-none transition-colors"
                      >
                        Suivant
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'revenue' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#111] border border-white/10 p-6 rounded-2xl">
                      <div className="text-white/50 text-xs font-bold uppercase tracking-widest mb-2">Total Salons</div>
                      <div className="text-4xl font-black">{tenants.length}</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-6 rounded-2xl">
                      <div className="text-green-400 text-xs font-bold uppercase tracking-widest mb-2">Actifs</div>
                      <div className="text-4xl font-black">{activeTenants.length}</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-6 rounded-2xl">
                      <div className="text-yellow-400 text-xs font-bold uppercase tracking-widest mb-2">En Essai</div>
                      <div className="text-4xl font-black">{trialingTenants.length}</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-6 rounded-2xl">
                      <div className="text-purple-400 text-xs font-bold uppercase tracking-widest mb-2">Salons Gratuits</div>
                      <div className="text-4xl font-black">{freeTenants.length}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-[#D4AF37]/20 p-8 rounded-3xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#D4AF37]/10 blur-3xl" />
                      <div className="text-[#D4AF37] text-sm font-bold uppercase tracking-widest mb-2">MRR Estimé</div>
                      <div className="text-6xl font-black mb-2">€{totalMRR}</div>
                      <div className="text-white/40 text-sm font-medium">Revenu mensuel récurrent</div>
                    </div>
                    <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] border border-green-500/20 p-8 rounded-3xl relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/10 blur-3xl" />
                      <div className="text-green-400 text-sm font-bold uppercase tracking-widest mb-2">ARR Estimé</div>
                      <div className="text-6xl font-black mb-2">€{totalARR}</div>
                      <div className="text-white/40 text-sm font-medium">Revenu annuel récurrent</div>
                    </div>
                  </div>

                  <div className="bg-[#111] border border-white/10 p-8 rounded-3xl">
                    <h3 className="text-xl font-bold mb-6">Répartition par Plan (Actifs)</h3>
                    <div className="flex items-end gap-8 h-48">
                      {Object.entries(planCounts).map(([plan, count]) => {
                        const max = Math.max(...Object.values(planCounts), 1);
                        const height = (count / max) * 100;
                        const colors: Record<string, string> = {
                          basic: 'from-blue-500/50 to-blue-500',
                          pro: 'from-[#D4AF37]/50 to-[#D4AF37]',
                          enterprise: 'from-purple-500/50 to-purple-500',
                          free: 'from-gray-500/50 to-gray-500'
                        };
                        return (
                          <div key={plan} className="flex-1 flex flex-col items-center gap-4">
                            <div className="text-2xl font-black">{count}</div>
                            <div className={`w-full bg-gradient-to-t ${colors[plan]} rounded-t-xl transition-all`} style={{ height: `${height}%`, minHeight: '4px' }} />
                            <div className="text-xs font-bold uppercase text-white/50">{plan}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'bookings' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
                  <div className="grid grid-cols-5 gap-4">
                    <div className="bg-[#111] border border-white/10 p-4 rounded-xl text-center">
                      <div className="text-3xl font-black mb-1">{bookings.length}</div>
                      <div className="text-[10px] text-white/50 uppercase font-bold">Total Réservations</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-4 rounded-xl text-center">
                      <div className="text-3xl font-black mb-1 text-yellow-400">{bookings.filter(b => b.status === 'pending').length}</div>
                      <div className="text-[10px] text-white/50 uppercase font-bold">En attente</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-4 rounded-xl text-center">
                      <div className="text-3xl font-black mb-1 text-green-400">{bookings.filter(b => b.status === 'approved').length}</div>
                      <div className="text-[10px] text-white/50 uppercase font-bold">Approuvées</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-4 rounded-xl text-center">
                      <div className="text-3xl font-black mb-1 text-blue-400">{bookings.filter(b => b.status === 'completed').length}</div>
                      <div className="text-[10px] text-white/50 uppercase font-bold">Terminées</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-4 rounded-xl text-center">
                      <div className="text-3xl font-black mb-1 text-red-400">{bookings.filter(b => b.status === 'rejected').length}</div>
                      <div className="text-[10px] text-white/50 uppercase font-bold">Rejetées</div>
                    </div>
                  </div>

                  <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
                    <div className="overflow-x-auto w-full">
                    <table className="min-w-[600px] w-full text-left text-sm">
                      <thead className="bg-white/5 border-b border-white/10 text-white/50">
                        <tr>
                          <th className="p-4 font-medium">Salon</th>
                          <th className="p-4 font-medium">Client</th>
                          <th className="p-4 font-medium">Service ID</th>
                          <th className="p-4 font-medium">Date & Heure</th>
                          <th className="p-4 font-medium text-right">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {bookings.sort((a, b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime()).slice(0, 50).map(b => {
                          const tenant = tenants.find(t => t.id === b.tenantId);
                          return (
                            <tr key={b.id} className="hover:bg-white/5">
                              <td className="p-4 text-xs font-medium text-white/70">{tenant?.name || b.tenantId}</td>
                              <td className="p-4 font-bold">{b.clientName}</td>
                              <td className="p-4 text-white/60 text-xs">{b.serviceId}</td>
                              <td className="p-4">{b.date} à {b.time}</td>
                              <td className="p-4 text-right">
                                <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase inline-block ${
                                  b.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                                  b.status === 'completed' ? 'bg-blue-500/20 text-blue-400' :
                                  b.status === 'rejected' ? 'bg-red-500/20 text-red-400' :
                                  'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                  {b.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'free' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12">
                  <form onSubmit={grantFreeAccessForm} className="bg-[#111] border border-white/10 p-8 rounded-3xl max-w-xl space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Accorder un accès gratuit</h3>
                      <p className="text-sm text-white/50 mb-6">Permet à un salon d'utiliser Barberboard gratuitement à vie avec le plan choisi.</p>
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Sous-domaine du salon</label>
                        <input
                          type="text"
                          required
                          value={freeSubdomain}
                          onChange={e => setFreeSubdomain(e.target.value)}
                          placeholder="ex: fadestudio"
                          className="w-full bg-black border border-white/10 rounded-xl p-4 text-white placeholder:text-white/20 focus:border-[#D4AF37] outline-none transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-widest text-white/50 mb-2">Plan accordé</label>
                        <select
                          value={freePlan}
                          onChange={e => setFreePlan(e.target.value)}
                          className="w-full bg-black border border-white/10 rounded-xl p-4 text-white focus:border-[#D4AF37] outline-none transition-colors appearance-none"
                        >
                          <option value="basic">Basic (2 coiffeurs)</option>
                          <option value="pro">Pro (8 coiffeurs)</option>
                          <option value="enterprise">Enterprise (Illimité)</option>
                        </select>
                      </div>
                    </div>
                    
                    <button type="submit" className="w-full py-4 bg-[#D4AF37] text-black font-black uppercase rounded-xl hover:scale-105 transition-transform">
                      Accorder l'accès
                    </button>
                  </form>

                  <div>
                    <h3 className="text-xl font-bold mb-6">Salons bénéficiant d'un accès gratuit</h3>
                    <div className="bg-[#111] border border-white/10 rounded-2xl overflow-hidden">
                      <div className="overflow-x-auto w-full">
                      <table className="min-w-[600px] w-full text-left text-sm">
                        <thead className="bg-white/5 border-b border-white/10 text-white/50">
                          <tr>
                            <th className="p-4 font-medium">Salon</th>
                            <th className="p-4 font-medium">Sous-domaine</th>
                            <th className="p-4 font-medium">Plan</th>
                            <th className="p-4 font-medium">Accordé le</th>
                            <th className="p-4 font-medium text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {freeTenants.length === 0 && (
                            <tr>
                              <td colSpan={5} className="p-8 text-center text-white/30 italic">Aucun accès gratuit accordé.</td>
                            </tr>
                          )}
                          {freeTenants.map(t => (
                            <tr key={t.id} className="hover:bg-white/5">
                              <td className="p-4 font-bold">{t.name}</td>
                              <td className="p-4 text-white/60">{t.subdomain}</td>
                              <td className="p-4 uppercase text-xs font-black">{t.subscription?.planId}</td>
                              <td className="p-4 text-white/50">{t.freeAccessGrantedAt ? new Date(t.freeAccessGrantedAt).toLocaleDateString() : 'N/A'}</td>
                              <td className="p-4"><div className="flex flex-wrap gap-1 justify-end">
                                <button onClick={() => revokeFreeAccess(t.id)} className="px-3 py-1 bg-red-500/10 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/20">
                                  Révoquer
                                </button>
                              </div></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'payments' && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  {/* Top section — 4 metric cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-[#111] border border-white/10 p-6 rounded-3xl space-y-2">
                      <div className="text-white/50 text-xs font-bold uppercase tracking-wider">Total encaissé</div>
                      <div className="text-3xl font-black text-[#D4AF37]">€{totalManualEncaisse.toFixed(2)}</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-6 rounded-3xl space-y-2">
                      <div className="text-white/50 text-xs font-bold uppercase tracking-wider">Paiements en attente</div>
                      <div className="text-3xl font-black text-yellow-400">{pendingPaymentsCount}</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-6 rounded-3xl space-y-2">
                      <div className="text-white/50 text-xs font-bold uppercase tracking-wider">MRR Manuel (Mois en cours)</div>
                      <div className="text-3xl font-black text-green-400">€{mrrManuel.toFixed(2)}</div>
                    </div>
                    <div className="bg-[#111] border border-white/10 p-6 rounded-3xl space-y-2">
                      <div className="text-white/50 text-xs font-bold uppercase tracking-wider">Clients actifs</div>
                      <div className="text-3xl font-black text-blue-400">{activeManualTenantsCount}</div>
                    </div>
                  </div>

                  {/* Filter bar */}
                  <div className="bg-[#111] border border-white/10 p-6 rounded-3xl space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                      <div className="flex flex-wrap gap-3 items-center flex-1 w-full">
                        <div className="relative flex-1 min-w-[200px]">
                          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                          <input
                            type="text"
                            placeholder="Rechercher par salon ou client..."
                            value={paySearch}
                            onChange={e => setPaySearch(e.target.value)}
                            className="w-full bg-black border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 focus:border-[#D4AF37] outline-none"
                          />
                        </div>

                        <select
                          value={payStatusFilter}
                          onChange={e => setPayStatusFilter(e.target.value)}
                          className="bg-black border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D4AF37]"
                        >
                          <option value="all">Tous les statuts</option>
                          <option value="paid">Payé</option>
                          <option value="pending">En attente</option>
                          <option value="partial">Partiel</option>
                        </select>

                        <select
                          value={payMethodFilter}
                          onChange={e => setPayMethodFilter(e.target.value)}
                          className="bg-black border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D4AF37]"
                        >
                          <option value="all">Toutes les méthodes</option>
                          <option value="cash">💵 Espèces</option>
                          <option value="bank_transfer">🏦 Virement</option>
                          <option value="western_union">💸 Western Union</option>
                          <option value="paypal">💳 PayPal</option>
                          <option value="other">📝 Autre</option>
                        </select>

                        <select
                          value={payCurrencyFilter}
                          onChange={e => setPayCurrencyFilter(e.target.value)}
                          className="bg-black border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-[#D4AF37]"
                        >
                          <option value="all">Toutes les devises</option>
                          <option value="EUR">EUR</option>
                          <option value="DZD">DZD</option>
                          <option value="MAD">MAD</option>
                          <option value="TND">TND</option>
                          <option value="SAR">SAR</option>
                          <option value="AED">AED</option>
                          <option value="GBP">GBP</option>
                          <option value="USD">USD</option>
                        </select>

                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={payDateFrom}
                            onChange={e => setPayDateFrom(e.target.value)}
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D4AF37]"
                          />
                          <span className="text-white/40 text-xs">à</span>
                          <input
                            type="date"
                            value={payDateTo}
                            onChange={e => setPayDateTo(e.target.value)}
                            className="bg-black border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-[#D4AF37]"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setNewPayDate(new Date().toISOString().split('T')[0]);
                          setIsNewPaymentModalOpen(true);
                        }}
                        className="px-5 py-2.5 bg-[#D4AF37] hover:bg-[#FFD700] text-black font-black text-xs uppercase rounded-xl transition-all w-full md:w-auto text-center"
                      >
                        Nouveau paiement
                      </button>
                    </div>
                  </div>

                  {/* Payments Table */}
                  <div className="bg-[#111] border border-white/10 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto w-full">
                    <table className="min-w-[700px] w-full text-left text-sm">
                      <thead className="bg-white/5 border-b border-white/10 text-white/50">
                        <tr>
                          <th className="p-4 font-medium">Date</th>
                          <th className="p-4 font-medium">Client</th>
                          <th className="p-4 font-medium">Montant</th>
                          <th className="p-4 font-medium">Méthode</th>
                          <th className="p-4 font-medium">Plan</th>
                          <th className="p-4 font-medium">Statut</th>
                          <th className="p-4 font-medium text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredPayments.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-white/30 italic">
                              Aucun paiement enregistré. Cliquez sur 'Nouveau paiement' pour commencer.
                            </td>
                          </tr>
                        ) : (
                          filteredPayments.map(p => {
                            const tObj = tenants.find(ten => ten.id === p.tenantId);
                            const isTenantActive = tObj?.subscription?.status === 'active' && tObj?.subscription?.manualPaymentId === p.id;
                            
                            return (
                              <tr key={p.id} className="hover:bg-white/5 transition-colors">
                                <td className="p-4 text-white/60">
                                  {new Date(p.paidAt).toLocaleDateString()}
                                </td>
                                <td className="p-4">
                                  <div className="font-bold">{p.tenantName}</div>
                                  <div className="text-xs text-white/40 mt-0.5">{p.clientName}</div>
                                  <span className="inline-block text-[9px] font-mono text-white/50 bg-white/5 px-1.5 py-0.5 rounded mt-1 border border-white/5">
                                    {p.tenantSubdomain}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <div className="font-bold text-[#D4AF37]">€{Number(p.amount || 0).toFixed(2)}</div>
                                  {p.originalCurrency && p.originalCurrency !== 'EUR' && (
                                    <div className="text-xs text-white/40 mt-0.5">
                                      {p.originalAmount?.toFixed(2)} {p.originalCurrency}
                                    </div>
                                  )}
                                </td>
                                <td className="p-4">
                                  <span className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg text-xs">
                                    {p.paymentMethod === 'cash' ? '💵 Espèces' :
                                     p.paymentMethod === 'bank_transfer' ? '🏦 Virement' :
                                     p.paymentMethod === 'western_union' ? '💸 Western Union' :
                                     p.paymentMethod === 'paypal' ? '💳 PayPal' : '📝 Autre'}
                                  </span>
                                </td>
                                <td className="p-4">
                                  <span className="uppercase text-[10px] font-black px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded">
                                    {p.planId} ({p.planDuration === 'yearly' ? 'Annuel' : 'Mensuel'})
                                  </span>
                                </td>
                                <td className="p-4">
                                  <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                    p.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                                    p.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-orange-500/20 text-orange-400'
                                  }`}>
                                    {p.status === 'paid' ? 'Payé' : p.status === 'pending' ? 'En attente' : 'Partiel'}
                                  </span>
                                </td>
                              <td className="p-4"><div className="flex flex-wrap gap-1 justify-end">
                                {!isTenantActive && p.status === 'paid' && (
                                  <button
                                    onClick={() => handleActivateManualPayment(p)}
                                    className="px-3 py-1 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/20 rounded-lg text-xs font-bold transition-all"
                                  >
                                    ✓ Activer
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedPayment(p);
                                    setIsEditPaymentMode(false);
                                  }}
                                  className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 rounded-lg text-xs font-bold transition-all"
                                >
                                  👁 Voir
                                </button>
                              </div></td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </motion.div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Tenant Detail Modal */}
      {selectedTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-gradient-to-br from-[#141414] to-[#0a0a0a] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-white max-h-[90vh] overflow-y-auto custom-scrollbar">
            {/* Close button */}
            <button 
              onClick={() => setSelectedTenant(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>

            {isEditMode ? (
              /* Edit Mode Form */
              <form onSubmit={handleSaveEdit} className="space-y-6">
                <h2 className="text-2xl font-black text-[#D4AF37] border-b border-white/10 pb-4">
                  Modifier le salon: {selectedTenant.name}
                </h2>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Nom du salon</label>
                    <input
                      type="text"
                      required
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Couleur primaire</label>
                    <div className="flex gap-3">
                      <input
                        type="color"
                        value={editPrimaryColor}
                        onChange={e => setEditPrimaryColor(e.target.value)}
                        className="w-12 h-12 bg-transparent border-0 cursor-pointer rounded-xl"
                      />
                      <input
                        type="text"
                        required
                        value={editPrimaryColor}
                        onChange={e => setEditPrimaryColor(e.target.value)}
                        className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white font-mono transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Limite coiffeurs max</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={editMaxBarbers}
                      onChange={e => setEditMaxBarbers(Number(e.target.value))}
                      className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Réservations en ligne</label>
                    <div className="flex items-center gap-3 h-full">
                      <input
                        type="checkbox"
                        id="allowOnlineBooking"
                        checked={editOnlineBookingEnabled}
                        onChange={e => setEditOnlineBookingEnabled(e.target.checked)}
                        className="w-6 h-6 rounded accent-[#D4AF37] border-white/10 bg-black"
                      />
                      <label htmlFor="allowOnlineBooking" className="text-sm font-bold text-white/80 cursor-pointer">
                        Autoriser les réservations
                      </label>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Plan</label>
                    <select
                      value={editPlanId}
                      onChange={e => setEditPlanId(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="basic">Basic (2 coiffeurs)</option>
                      <option value="pro">Pro (8 coiffeurs)</option>
                      <option value="enterprise">Enterprise (Illimité)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Statut de l'abonnement</label>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="active">Active</option>
                      <option value="trialing">Trialing</option>
                      <option value="past_due">Past Due</option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-6 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsEditMode(false)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-sm transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saveLoading}
                    className="px-6 py-3 bg-[#D4AF37] hover:bg-[#FFD700] text-black rounded-xl font-black text-sm transition-all"
                  >
                    {saveLoading ? 'Sauvegarde...' : '💾 Sauvegarder'}
                  </button>
                </div>
              </form>
            ) : (
              /* View Mode */
              <div className="space-y-8">
                <div>
                  <h2 className="text-2xl font-black text-[#D4AF37] border-b border-white/10 pb-4 flex items-center gap-3">
                    <span>Détails du salon: {selectedTenant.name}</span>
                    {selectedTenant.freeAccess && (
                      <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-md text-[10px] font-black uppercase">
                        Accès Gratuit
                      </span>
                    )}
                  </h2>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Section 1: Informations Générales */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/40 border-b border-white/5 pb-2">
                      Section 1 — Informations générales
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-white/50">Nom:</span> <span className="font-bold">{selectedTenant.name}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">Sous-domaine:</span> <span className="font-mono text-[#D4AF37]">{selectedTenant.subdomain}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">Owner UID:</span> <span className="font-mono text-xs text-white/60 truncate max-w-[180px]">{selectedTenant.ownerUid || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">Date création:</span> <span>{selectedTenant.createdAt ? new Date(selectedTenant.createdAt).toLocaleDateString() : 'N/A'}</span></div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Statut / Plan:</span> 
                        <div className="flex gap-2">
                          <span className="px-2 py-0.5 bg-green-500/15 text-green-400 rounded text-[10px] font-black uppercase">
                            {selectedTenant.subscription?.status || 'Inconnu'}
                          </span>
                          <span className="px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded text-[10px] font-black uppercase">
                            {selectedTenant.subscription?.planId || 'Basic'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Abonnement */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/40 border-b border-white/5 pb-2">
                      Section 2 — Abonnement
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-white/50">Plan ID:</span> <span className="uppercase font-bold">{selectedTenant.subscription?.planId || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">Statut:</span> <span className="capitalize">{selectedTenant.subscription?.status || 'N/A'}</span></div>
                      <div className="flex justify-between"><span className="text-white/50">Fin d'essai:</span> <span>{formatDate(selectedTenant.subscription?.trialEndsAt)}</span></div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Jours d'essai restants:</span> 
                        <span className="font-bold text-yellow-400">{getTrialDaysRemaining(selectedTenant.subscription?.trialEndsAt)} jours</span>
                      </div>
                      <div className="flex justify-between"><span className="text-white/50">Stripe Customer ID:</span> <span className="font-mono text-xs text-white/60 truncate max-w-[180px]">{selectedTenant.stripeCustomerId || 'N/A'}</span></div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-8">
                  {/* Section 3: Paramètres */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/40 border-b border-white/5 pb-2">
                      Section 3 — Paramètres
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-white/50">Limite coiffeurs max:</span> <span className="font-bold">{selectedTenant.settings?.maxBarbersLimit || 'N/A'}</span></div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Réservation en ligne:</span> 
                        <span className={`font-bold ${selectedTenant.settings?.allowOnlineBooking !== false ? 'text-green-400' : 'text-red-400'}`}>
                          {selectedTenant.settings?.allowOnlineBooking !== false ? 'Oui' : 'Non'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Horaires configurés:</span> 
                        <span>{selectedTenant.settings?.weeklyHours ? 'Oui' : 'Non'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Section 4: Branding */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-wider text-white/40 border-b border-white/5 pb-2">
                      Section 4 — Branding
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-white/50">Couleur primaire:</span> 
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded" style={{ backgroundColor: selectedTenant.branding?.primaryColor || '#D4AF37' }} />
                          <span className="font-mono text-xs">{selectedTenant.branding?.primaryColor || '#D4AF37'}</span>
                        </div>
                      </div>
                      <div className="flex justify-between"><span className="text-white/50">Nom commercial:</span> <span>{selectedTenant.branding?.businessName || 'N/A'}</span></div>
                      <div className="flex justify-between">
                        <span className="text-white/50">Logo URL:</span> 
                        <span className="text-xs text-white/50 truncate max-w-[180px]">{selectedTenant.branding?.logoUrl || 'Aucun logo'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Statistiques en temps réel */}
                <div className="space-y-4 bg-white/5 border border-white/10 p-5 rounded-2xl">
                  <h3 className="text-sm font-black uppercase tracking-wider text-[#D4AF37] border-b border-white/5 pb-2">
                    Section 5 — Statistiques en temps réel
                  </h3>
                  {liveStats?.loading ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-6 h-6 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="text-lg font-black">{liveStats?.bookingsCount}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold">Réservations</div>
                      </div>
                      <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="text-lg font-black">{liveStats?.barbersCount}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold">Collaborateurs</div>
                      </div>
                      <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="text-lg font-black">{liveStats?.servicesCount}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold">Services</div>
                      </div>
                      <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="text-lg font-black text-green-400">€{liveStats?.totalRevenue}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold">Revenu Total</div>
                      </div>
                      <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="text-lg font-black text-rose-400">€{liveStats?.totalExpenses}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold">Dépenses</div>
                      </div>
                      <div className="p-3 bg-black/40 border border-white/5 rounded-xl">
                        <div className="text-lg font-black text-blue-400">€{liveStats?.netBalance}</div>
                        <div className="text-[10px] text-white/40 uppercase font-bold">Solde Net</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Section 6: Actions rapides */}
                <div className="flex flex-wrap justify-between items-center gap-3 pt-6 border-t border-white/10">
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await handleFreeAccess(selectedTenant.id);
                        setSelectedTenant(prev => prev ? {
                          ...prev,
                          freeAccess: true,
                          subscription: { ...prev.subscription, status: 'active', planId: 'pro' }
                        } : null);
                      }}
                      className="px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      ✓ Accès gratuit
                    </button>
                    <button
                      onClick={async () => {
                        await handleSuspend(selectedTenant.id);
                        setSelectedTenant(prev => prev ? {
                          ...prev,
                          subscription: { ...prev.subscription, status: 'canceled' }
                        } : null);
                      }}
                      className="px-4 py-2.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      ⏸ Suspendre
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleEnterEditMode}
                      className="px-4 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => setSelectedTenant(null)}
                      className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-colors"
                    >
                      ✕ Fermer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* New Payment Modal */}
      {isNewPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#141414] to-[#0a0a0a] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-white max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => setIsNewPaymentModalOpen(false)}
              className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>

            <form onSubmit={handleCreateManualPayment} className="space-y-6">
              <h2 className="text-2xl font-black text-[#D4AF37] border-b border-white/10 pb-4">
                Enregistrer un paiement manuel
              </h2>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Salon</label>
                  <select
                    required
                    value={newPayTenantId}
                    onChange={e => {
                      const tid = e.target.value;
                      setNewPayTenantId(tid);
                      const ten = tenants.find(t => t.id === tid);
                      if (ten) {
                        setNewPayClientName(ten.name || '');
                      }
                    }}
                    className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                  >
                    <option value="">Sélectionner un salon...</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.subdomain})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Nom du client</label>
                  <input
                    type="text"
                    required
                    value={newPayClientName}
                    onChange={e => setNewPayClientName(e.target.value)}
                    placeholder="Nom du propriétaire"
                    className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Montant payé</label>
                  <input
                    type="number"
                    step="any"
                    required
                    min={0}
                    value={newPayAmountPaid || ''}
                    onChange={e => setNewPayAmountPaid(Number(e.target.value))}
                    placeholder="Ex: 29"
                    className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Devise</label>
                  <select
                    value={newPayCurrency}
                    onChange={e => {
                      const cur = e.target.value;
                      setNewPayCurrency(cur);
                      if (cur === 'EUR') {
                        setNewPayExchangeRate(1);
                      }
                    }}
                    className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                  >
                    <option value="EUR">EUR (€)</option>
                    <option value="DZD">DZD (DA)</option>
                    <option value="MAD">MAD (DH)</option>
                    <option value="TND">TND (DT)</option>
                    <option value="SAR">SAR (SR)</option>
                    <option value="AED">AED (DH)</option>
                    <option value="GBP">GBP (£)</option>
                    <option value="USD">USD ($)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Méthode</label>
                  <select
                    value={newPayMethod}
                    onChange={e => setNewPayMethod(e.target.value as any)}
                    className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                  >
                    <option value="cash">💵 Espèces</option>
                    <option value="bank_transfer">🏦 Virement bancaire</option>
                    <option value="western_union">💸 Western Union</option>
                    <option value="paypal">💳 PayPal</option>
                    <option value="other">📝 Autre</option>
                  </select>
                </div>
              </div>

              {newPayCurrency !== 'EUR' && (
                <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Taux de change (1 {newPayCurrency} = X EUR)</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={newPayExchangeRate}
                      onChange={e => setNewPayExchangeRate(Number(e.target.value))}
                      className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>
                  <div className="flex flex-col gap-2 justify-center">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Calculé en EUR</label>
                    <div className="text-lg font-black text-[#D4AF37] pt-2">
                      €{(newPayAmountPaid * newPayExchangeRate).toFixed(2)}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Référence (Optionnel)</label>
                  <input
                    type="text"
                    value={newPayReference}
                    onChange={e => setNewPayReference(e.target.value)}
                    placeholder="Ex: Ref virement, MTCN Western Union"
                    className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Date du paiement</label>
                  <input
                    type="date"
                    required
                    value={newPayDate}
                    onChange={e => setNewPayDate(e.target.value)}
                    className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Plan souscrit</label>
                  <select
                    value={newPayPlanId}
                    onChange={e => setNewPayPlanId(e.target.value as any)}
                    className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                  >
                    <option value="basic">Basic (29€/mois)</option>
                    <option value="pro">Pro (59€/mois)</option>
                    <option value="enterprise">Enterprise (99€/mois)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Durée</label>
                  <select
                    value={newPayDuration}
                    onChange={e => setNewPayDuration(e.target.value as any)}
                    className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                  >
                    <option value="monthly">Mensuel</option>
                    <option value="yearly">Annuel</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Statut</label>
                  <select
                    value={newPayStatus}
                    onChange={e => setNewPayStatus(e.target.value as any)}
                    className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                  >
                    <option value="paid">Payé</option>
                    <option value="pending">En attente</option>
                    <option value="partial">Partiel</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Notes / Description (Optionnel)</label>
                <textarea
                  value={newPayNotes}
                  onChange={e => setNewPayNotes(e.target.value)}
                  placeholder="Notes internes, détails additionnels..."
                  rows={2}
                  className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors resize-none"
                />
              </div>

              <div className="flex items-center gap-3 bg-white/5 p-4 rounded-xl border border-white/10">
                <input
                  type="checkbox"
                  id="autoActivate"
                  checked={newPayAutoActivate}
                  onChange={e => setNewPayAutoActivate(e.target.checked)}
                  className="w-6 h-6 rounded accent-[#D4AF37] border-white/10 bg-black cursor-pointer"
                />
                <div className="flex-1 cursor-pointer">
                  <label htmlFor="autoActivate" className="text-sm font-bold text-white/95 cursor-pointer block">
                    ✓ Activer automatiquement l'abonnement du salon
                  </label>
                  <span className="text-[10px] text-white/40 block mt-0.5">
                    Mettra à jour le statut du salon en "actif" et configurera les dates de validité.
                  </span>
                </div>
              </div>

              <p className="text-xs text-white/40 italic">
                📧 Un email de confirmation sera envoyé automatiquement une fois le système email configuré.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsNewPaymentModalOpen(false)}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-sm transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saveLoading}
                  className="px-6 py-3 bg-[#D4AF37] hover:bg-[#FFD700] text-black rounded-xl font-black text-sm transition-all"
                >
                  {saveLoading ? 'Enregistrement...' : '💾 Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Detail Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-gradient-to-br from-[#141414] to-[#0a0a0a] border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl text-white max-h-[90vh] overflow-y-auto custom-scrollbar">
            <button 
              onClick={() => setSelectedPayment(null)}
              className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>

            {isEditPaymentMode ? (
              /* Edit Mode Form */
              <form onSubmit={handleSaveEditPayment} className="space-y-6">
                <h2 className="text-2xl font-black text-[#D4AF37] border-b border-white/10 pb-4">
                  Modifier le paiement: {selectedPayment.tenantName}
                </h2>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Salon</label>
                    <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white/60">
                      {selectedPayment.tenantName} ({selectedPayment.tenantSubdomain})
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Nom du client</label>
                    <input
                      type="text"
                      required
                      value={editPayClientName}
                      onChange={e => setEditPayClientName(e.target.value)}
                      className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Montant payé</label>
                    <input
                      type="number"
                      step="any"
                      required
                      min={0}
                      value={editPayAmountPaid || ''}
                      onChange={e => setEditPayAmountPaid(Number(e.target.value))}
                      className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Devise</label>
                    <select
                      value={editPayCurrency}
                      onChange={e => {
                        const cur = e.target.value;
                        setEditPayCurrency(cur);
                        if (cur === 'EUR') {
                          setEditPayExchangeRate(1);
                        }
                      }}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="EUR">EUR (€)</option>
                      <option value="DZD">DZD (DA)</option>
                      <option value="MAD">MAD (DH)</option>
                      <option value="TND">TND (DT)</option>
                      <option value="SAR">SAR (SR)</option>
                      <option value="AED">AED (DH)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Méthode</label>
                    <select
                      value={editPayMethod}
                      onChange={e => setEditPayMethod(e.target.value as any)}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="cash">💵 Espèces</option>
                      <option value="bank_transfer">🏦 Virement bancaire</option>
                      <option value="western_union">💸 Western Union</option>
                      <option value="paypal">💳 PayPal</option>
                      <option value="other">📝 Autre</option>
                    </select>
                  </div>
                </div>

                {editPayCurrency !== 'EUR' && (
                  <div className="grid grid-cols-2 gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Taux de change (1 {editPayCurrency} = X EUR)</label>
                      <input
                        type="number"
                        step="any"
                        required
                        value={editPayExchangeRate}
                        onChange={e => setEditPayExchangeRate(Number(e.target.value))}
                        className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                      />
                    </div>
                    <div className="flex flex-col gap-2 justify-center">
                      <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Calculé en EUR</label>
                      <div className="text-lg font-black text-[#D4AF37] pt-2">
                        €{(editPayAmountPaid * editPayExchangeRate).toFixed(2)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Référence</label>
                    <input
                      type="text"
                      value={editPayReference}
                      onChange={e => setEditPayReference(e.target.value)}
                      className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Date du paiement</label>
                    <input
                      type="date"
                      required
                      value={editPayDate}
                      onChange={e => setEditPayDate(e.target.value)}
                      className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Plan souscrit</label>
                    <select
                      value={editPayPlanId}
                      onChange={e => setEditPayPlanId(e.target.value as any)}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="basic">Basic (29€/mois)</option>
                      <option value="pro">Pro (59€/mois)</option>
                      <option value="enterprise">Enterprise (99€/mois)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Durée</label>
                    <select
                      value={editPayDuration}
                      onChange={e => setEditPayDuration(e.target.value as any)}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="monthly">Mensuel</option>
                      <option value="yearly">Annuel</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Statut</label>
                    <select
                      value={editPayStatus}
                      onChange={e => setEditPayStatus(e.target.value as any)}
                      className="w-full bg-black border border-white/10 rounded-xl p-3.5 text-white focus:border-[#D4AF37] outline-none transition-colors"
                    >
                      <option value="paid">Payé</option>
                      <option value="pending">En attente</option>
                      <option value="partial">Partiel</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/50 tracking-wider">Notes / Description (Optionnel)</label>
                  <textarea
                    value={editPayNotes}
                    onChange={e => setEditPayNotes(e.target.value)}
                    rows={2}
                    className="px-4 py-3 bg-black border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-colors resize-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsEditPaymentMode(false)}
                    className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-bold text-sm transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={saveLoading}
                    className="px-6 py-3 bg-[#D4AF37] hover:bg-[#FFD700] text-black rounded-xl font-black text-sm transition-all"
                  >
                    {saveLoading ? 'Sauvegarde...' : '💾 Sauvegarder'}
                  </button>
                </div>
              </form>
            ) : (
              /* Detail View Mode */
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-black text-[#D4AF37] border-b border-white/10 pb-4 flex items-center justify-between">
                    <span>Détails du paiement</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      selectedPayment.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                      selectedPayment.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {selectedPayment.status === 'paid' ? 'Payé' : selectedPayment.status === 'pending' ? 'En attente' : 'Partiel'}
                    </span>
                  </h2>
                </div>

                {/* Section: Suivi timeline */}
                {renderTimeline(selectedPayment)}

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Info Salon */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-white/50 tracking-wider border-b border-white/5 pb-1">Information Salon</h3>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-white/40">Nom:</span> <span className="font-bold">{selectedPayment.tenantName}</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Sous-domaine:</span> <span className="font-mono text-[#D4AF37]">{selectedPayment.tenantSubdomain}</span></div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Statut abonnement actuel:</span>
                        <span className="capitalize font-bold">
                          {tenants.find(t => t.id === selectedPayment.tenantId)?.subscription?.status || 'Aucun'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Info Paiement */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-white/50 tracking-wider border-b border-white/5 pb-1">Détails de transaction</h3>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-white/40">Propriétaire:</span> <span className="font-bold">{selectedPayment.clientName}</span></div>
                      <div className="flex justify-between">
                        <span className="text-white/40">Montant en EUR:</span> 
                        <span className="font-black text-[#D4AF37]">€{Number(selectedPayment.amount || 0).toFixed(2)}</span>
                      </div>
                      {selectedPayment.originalCurrency && selectedPayment.originalCurrency !== 'EUR' && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-white/40">Montant d'origine:</span> 
                            <span>{selectedPayment.originalAmount?.toFixed(2)} {selectedPayment.originalCurrency}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-white/40">Taux de change:</span> 
                            <span className="font-mono text-xs">{selectedPayment.exchangeRate}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between">
                        <span className="text-white/40">Méthode de paiement:</span> 
                        <span>
                          {selectedPayment.paymentMethod === 'cash' ? '💵 Espèces' :
                           selectedPayment.paymentMethod === 'bank_transfer' ? '🏦 Virement bancaire' :
                           selectedPayment.paymentMethod === 'western_union' ? '💸 Western Union' :
                           selectedPayment.paymentMethod === 'paypal' ? '💳 PayPal' : '📝 Autre'}
                        </span>
                      </div>
                      {selectedPayment.reference && (
                        <div className="flex justify-between"><span className="text-white/40">Référence:</span> <span className="font-mono text-xs">{selectedPayment.reference}</span></div>
                      )}
                      <div className="flex justify-between"><span className="text-white/40">Date:</span> <span>{new Date(selectedPayment.paidAt).toLocaleDateString()}</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Enregistré par:</span> <span className="text-white/70">{selectedPayment.createdByName}</span></div>
                    </div>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Plan Details */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-white/50 tracking-wider border-b border-white/5 pb-1">Abonnement souscrit</h3>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-white/40">Plan:</span> <span className="font-bold uppercase text-purple-400">{selectedPayment.planId}</span></div>
                      <div className="flex justify-between"><span className="text-white/40">Durée:</span> <span className="capitalize">{selectedPayment.planDuration === 'monthly' ? 'Mensuel' : 'Annuel'}</span></div>
                    </div>
                  </div>

                  {/* Notes / Description */}
                  {selectedPayment.description && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-bold uppercase text-white/50 tracking-wider border-b border-white/5 pb-1">Notes internes</h3>
                      <p className="text-sm text-white/75 bg-white/5 p-3 border border-white/10 rounded-xl font-mono leading-relaxed">
                        {selectedPayment.description}
                      </p>
                    </div>
                  )}
                </div>

                {/* Section 6: Actions rapides */}
                <div className="flex flex-wrap justify-between items-center gap-3 pt-6 border-t border-white/10">
                  <div className="flex gap-2">
                    {selectedPayment.status !== 'paid' && (
                      <button
                        onClick={() => handleMarkPaymentAsPaid(selectedPayment)}
                        className="px-4 py-2.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 border border-green-500/25 rounded-xl text-xs font-bold transition-all"
                      >
                        ✓ Marquer comme payé
                      </button>
                    )}
                    {selectedPayment.status === 'paid' && (
                      <button
                        onClick={() => handleActivateManualPayment(selectedPayment)}
                        className="px-4 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/25 rounded-xl text-xs font-bold transition-all"
                      >
                        ⚡ Activer l'abonnement
                      </button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleEnterEditPaymentMode}
                      className="px-4 py-2.5 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 border border-yellow-500/25 rounded-xl text-xs font-bold transition-all"
                    >
                      ✏️ Modifier
                    </button>
                    <button
                      onClick={() => setSelectedPayment(null)}
                      className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold transition-all"
                    >
                      ✕ Fermer
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AnimatedCounter({ value, duration = 1000, prefix = '', suffix = '' }: { value: number; duration?: number; prefix?: string; suffix?: string }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    const end = value;
    if (start === end) {
      setCount(end);
      return;
    }
    const totalMiliseconds = duration;
    const incrementTime = Math.max(Math.floor(totalMiliseconds / Math.max(end, 1)), 15);
    const step = (end - start) / (totalMiliseconds / incrementTime);
    
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        clearInterval(timer);
        setCount(end);
      } else {
        setCount(Math.floor(start));
      }
    }, incrementTime);

    return () => clearInterval(timer);
  }, [value, duration]);

  if (prefix || suffix) {
    const formatted = count.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    return <span>{prefix}{formatted}{suffix}</span>;
  }
  return <span>{count.toLocaleString('fr-FR')}</span>;
}
