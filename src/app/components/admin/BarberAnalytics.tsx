import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend,
} from 'recharts';
import {
  Trophy, TrendingUp, Users, Scissors, DollarSign, Clock,
  Wallet, Star, Calendar, ArrowUpRight, ArrowDownRight,
  CreditCard, AlertCircle, Award,
} from 'lucide-react';

interface Booking {
  id: string;
  barberId: string;
  serviceId: string;
  date: string;
  time: string;
  status: string;
  pricePaid?: number;
  tip?: number;
  paymentMethod?: string;
  type?: string;
  clientName?: string;
}
interface Barber { id: string; name: string; commission?: number; image?: string; }
interface Service { id: string; name: string; duration?: string; price?: string; }
interface Attendance { barberId: string; date: string; }

interface Props {
  bookings: Booking[];
  barbers: Barber[];
  services: Service[];
  attendance: Attendance[];
  isBarberView?: boolean;
  sales?: any[];
  expenses?: any[];
}

const GOLD_COLORS = ['#D4AF37', '#FFD700', '#B8960C', '#F5E050', '#C8A415', '#EAC730', '#A0830A'];

// SafeChart: catches any Recharts runtime error and shows a graceful fallback
function SafeChart({ children, height = 220 }: { children: React.ReactNode; height?: number }) {
  try {
    return <>{children}</>;
  } catch (e) {
    console.error('SafeChart caught a Recharts error:', e);
    return <div style={{ height }} className="flex items-center justify-center text-white/20 text-sm italic">Graphique indisponible</div>;
  }
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-[#D4AF37]', bg = 'bg-[#D4AF37]/10', trend }: any) {
  return (
    <div className="bg-[#141414] border border-white/5 p-6 rounded-3xl hover:border-[#D4AF37]/20 transition-all group relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-white/[0.02] to-transparent rounded-full -mr-10 -mt-10" />
      <div className={`p-3 rounded-2xl ${bg} w-fit mb-4 group-hover:scale-110 transition-transform ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-white/30 text-[10px] font-black uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-black text-white">{value}</p>
      {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(trend).toFixed(1)}% vs mois préc.
        </div>
      )}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-[#1a1a1a] border border-[#D4AF37]/20 rounded-xl p-3 shadow-xl text-xs">
        <p className="text-white/60 mb-1 font-bold">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }} className="font-black">
            {p.name}: {typeof p.value === 'number' && p.name?.includes('€') ? `€${p.value.toFixed(2)}` : p.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function BarberAnalytics({ bookings, barbers, services, attendance, isBarberView, sales = [], expenses = [] }: Props) {
  const [periodFilter, setPeriodFilter] = useState<'day' | 'week' | 'month' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // --- Local filters for Historique des Services ---
  const [histStartDate, setHistStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [histEndDate, setHistEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [histBarberId, setHistBarberId] = useState('all');
  const [histServiceId, setHistServiceId] = useState('all');
  const [histPaymentMethod, setHistPaymentMethod] = useState('all'); // all, cash, card
  const [histSearch, setHistSearch] = useState('');
  const [histPage, setHistPage] = useState(1);

  // Reset page when any filter state changes
  useEffect(() => {
    setHistPage(1);
  }, [histStartDate, histEndDate, histBarberId, histServiceId, histPaymentMethod, histSearch]);

  // Use local date to avoid UTC-midnight timezone mismatch
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const histFiltered = useMemo(() => {
    return bookings
      .filter(b => b.status === 'completed' || b.status === 'approved')
      .filter(b => {
        if (histStartDate && b.date < histStartDate) return false;
        if (histEndDate && b.date > histEndDate) return false;
        if (histBarberId !== 'all' && b.barberId !== histBarberId) return false;
        if (histServiceId !== 'all' && b.serviceId !== histServiceId) return false;
        if (histPaymentMethod !== 'all' && b.paymentMethod !== histPaymentMethod) return false;
        if (histSearch.trim() !== '') {
          const searchLower = histSearch.toLowerCase();
          const clientName = (b.clientName || 'Walk-in').toLowerCase();
          if (!clientName.includes(searchLower)) return false;
        }
        return true;
      })
      .sort((a, b) => `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`));
  }, [bookings, histStartDate, histEndDate, histBarberId, histServiceId, histPaymentMethod, histSearch]);

  const itemsPerPage = 10;
  const totalItems = histFiltered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedServices = useMemo(() => {
    const startIdx = (histPage - 1) * itemsPerPage;
    return histFiltered.slice(startIdx, startIdx + itemsPerPage);
  }, [histFiltered, histPage]);

  const handleResetFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setHistStartDate(d.toISOString().split('T')[0]);
    setHistEndDate(new Date().toISOString().split('T')[0]);
    setHistBarberId('all');
    setHistServiceId('all');
    setHistPaymentMethod('all');
    setHistSearch('');
    setHistPage(1);
  };

  // ── Period filter ──────────────────────────────────────────────────────────
  const periodRange = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    if (periodFilter === 'day') { return { start: todayStr, end: todayStr }; }
    if (periodFilter === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); return { start: d.toISOString().split('T')[0], end: todayStr }; }
    if (periodFilter === 'month') { const d = new Date(now); d.setDate(d.getDate() - 30); return { start: d.toISOString().split('T')[0], end: todayStr }; }
    if (periodFilter === 'custom') { return { start: customStart || '2000-01-01', end: customEnd || '2099-12-31' }; }
    return { start: '2000-01-01', end: '2099-12-31' };
  }, [periodFilter, customStart, customEnd]);

  const filtered = useMemo(
    () => bookings.filter(b => b.date >= periodRange.start && b.date <= periodRange.end && (b.status === 'completed' || b.status === 'approved')),
    [bookings, periodRange]
  );

  // ── Global KPIs ─────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const calculateValue = (b: Booking) => {
      if (!isBarberView) return b.pricePaid || 0;
      const barber = barbers.find(bb => bb.id === b.barberId);
      const commissionRate = barber?.commission ?? 50;
      return (b.pricePaid || 0) * (commissionRate / 100);
    };

    const revenue = filtered.reduce((s, b) => s + calculateValue(b), 0);
    const tips    = filtered.reduce((s, b) => s + (b.tip || 0), 0);
    const avecRdv = filtered.filter(b => b.type !== 'sans-rdv').length;
    const sansRdv = filtered.filter(b => b.type === 'sans-rdv').length;
    const avgDuration = services.reduce((s, sv) => {
      const mins = parseInt((sv.duration || '30').replace(/\D/g, ''), 10) || 30;
      return s + mins;
    }, 0) / (services.length || 1);

    // month-over-month
    const now = new Date().toISOString().split('T')[0];
    const monthAgoStart = (() => { const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0]; })();
    const monthAgoEnd   = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; })();
    const prevMonthBookings = bookings.filter(b => b.date >= monthAgoStart && b.date <= monthAgoEnd && (b.status === 'completed' || b.status === 'approved'));
    const prevRev = prevMonthBookings.reduce((s, b) => s + calculateValue(b), 0);
    const revTrend = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : 0;

    const cashBookings = filtered.filter(b => b.paymentMethod === 'cash');
    const cardBookings = filtered.filter(b => b.paymentMethod === 'card');
    const cashTotal = cashBookings.reduce((s, b) => s + calculateValue(b), 0);
    const cardTotal = cardBookings.reduce((s, b) => s + calculateValue(b), 0);

    return { 
      revenue, tips, total: revenue + tips, avecRdv, sansRdv, count: filtered.length, avgDuration, revTrend,
      cashTotal, cashCount: cashBookings.length,
      cardTotal, cardCount: cardBookings.length
    };
  }, [filtered, bookings, services, isBarberView, barbers]);

  const totalDepenses = useMemo(() => {
    return (expenses || [])
      .filter(e => {
        if (!e.createdAt) return false;
        try {
          const dateStr = new Date(e.createdAt).toISOString().split('T')[0];
          return dateStr >= periodRange.start && dateStr <= periodRange.end;
        } catch (err) {
          return false;
        }
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses, periodRange]);

  const soldeNet = kpis.revenue + kpis.tips - totalDepenses;


  // ── Per-barber analytics ────────────────────────────────────────────────────
  const barberStats = useMemo(() =>
    barbers.map(barber => {
      const bbs = filtered.filter(b => b.barberId === barber.id);
      const revenue = bbs.reduce((s, b) => s + (b.pricePaid || 0), 0);
      const tips    = bbs.reduce((s, b) => s + (b.tip || 0), 0);
      const rate    = barber.commission || 50;
      const barberShare = revenue * rate / 100;
      const avecRdv = bbs.filter(b => b.type !== 'sans-rdv').length;
      const sansRdv = bbs.filter(b => b.type === 'sans-rdv').length;

      // attendance count in period
      const attendCount = attendance.filter(a => a.barberId === barber.id && a.date >= periodRange.start && a.date <= periodRange.end).length;

      // NOTE: Do NOT include image/avatar fields here — Recharts iterates all
      // keys in data objects and will crash if it encounters a base64 string.
      return {
        id: String(barber.id || ''),
        name: String(barber.name || ''),
        count: bbs.length,
        revenue,
        tips,
        barberShare,
        avecRdv,
        sansRdv,
        attendCount,
        rate,
      };
    }).sort((a, b) => b.revenue - a.revenue),
  [barbers, filtered, attendance, periodRange]);

  // ── Top performer ──────────────────────────────────────────────────────────
  const topBarber = barberStats[0];

  // ── Most requested service ─────────────────────────────────────────────────
  const serviceStats = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(b => { if (b.serviceId) map[b.serviceId] = (map[b.serviceId] || 0) + 1; });
    return services.map(s => ({ name: String(s.name || ''), count: map[s.id] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [filtered, services]);

  const topService = serviceStats[0];

  // ── Revenue trend (last 14 days) ───────────────────────────────────────────
  const revenueTrend = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (13 - i));
      return d.toISOString().split('T')[0];
    });
    return days.map(date => {
      const dayBks = filtered.filter(b => b.date === date);
      return {
        date: String(date.slice(5)),
        'Revenus €': dayBks.reduce((s, b) => s + (b.pricePaid || 0), 0),
        Services: dayBks.length,
      };
    });
  }, [filtered]);

  // ── Daily performance (this week by barber) ────────────────────────────────
  const weeklyByBarber = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split('T')[0];
    });
    return days.map(date => {
      // Only use primitive-safe keys: String(name). Never spread barber objects.
      const row: Record<string, any> = { date: String(date.slice(5)) };
      barbers.forEach(b => {
        const safeKey = String(b.name || '');
        row[safeKey] = filtered.filter(bk => bk.date === date && bk.barberId === b.id).length;
      });
      return row;
    });
  }, [filtered, barbers]);

  const periodLabels: Record<string, string> = { day: "Aujourd'hui", week: 'Cette semaine', month: '30 derniers jours', custom: 'Période personnalisée' };

  return (
    <div className="space-y-10">
      {/* ── Period Filter ── */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-tighter">Analytics Avancés</h2>
            <p className="text-white/40 text-sm mt-1">Surveillance complète de l'activité du salon</p>
          </div>
          <div className="flex bg-[#141414] border border-white/10 rounded-2xl p-1 gap-1">
            {(['day', 'week', 'month', 'custom'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriodFilter(p)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  periodFilter === p ? 'bg-[#D4AF37] text-black shadow-lg' : 'text-white/40 hover:text-white'
                }`}
              >
                {p === 'day' ? 'Jour' : p === 'week' ? 'Sem.' : p === 'month' ? 'Mois' : 'Perso.'}
              </button>
            ))}
          </div>
        </div>
        
        {periodFilter === 'custom' && (
          <div className="flex items-center gap-4 bg-[#141414] border border-white/10 p-4 rounded-2xl ml-auto w-full md:w-auto">
            <div className="flex-1 md:w-40">
              <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Du</label>
              <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 outline-none focus:border-[#D4AF37] text-sm text-white [color-scheme:dark]" />
            </div>
            <div className="flex-1 md:w-40">
              <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Au</label>
              <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 outline-none focus:border-[#D4AF37] text-sm text-white [color-scheme:dark]" />
            </div>
          </div>
        )}
      </div>

      {/* ── Global KPI Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Chiffre d'Affaires" value={`€${kpis.revenue.toFixed(0)}`} sub={`+€${kpis.tips.toFixed(0)} pourboires`} icon={DollarSign} color="text-green-400" bg="bg-green-500/10" trend={kpis.revTrend} />
        <StatCard label="Services Réalisés" value={kpis.count} sub={`${kpis.avecRdv} RDV · ${kpis.sansRdv} Walk-in`} icon={Scissors} color="text-[#D4AF37]" bg="bg-[#D4AF37]/10" />
        <StatCard label="Total Espèces" value={`€${kpis.cashTotal.toFixed(0)}`} sub={`${kpis.cashCount} paiements en caisse`} icon={Wallet} color="text-amber-400" bg="bg-amber-500/10" />
      </div>

      {/* ── Secondary Breakdown Cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Total Carte */}
        <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl flex items-center gap-4 hover:border-[#D4AF37]/20 transition-all">
          <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400">
            <CreditCard className="w-4 h-4" />
          </div>
          <div>
            <p className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-0.5">Total Carte</p>
            <p className="text-lg font-black text-white">€{kpis.cardTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* Total Pourboires */}
        <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl flex items-center gap-4 hover:border-[#D4AF37]/20 transition-all">
          <div className="p-2.5 rounded-xl bg-green-500/10 text-green-400">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <p className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-0.5">Total Pourboires</p>
            <p className="text-lg font-black text-white">€{kpis.tips.toFixed(2)}</p>
          </div>
        </div>

        {/* Solde Net */}
        <div className="bg-[#141414] border border-white/5 p-4 rounded-2xl flex items-center gap-4 hover:border-[#D4AF37]/20 transition-all">
          <div className={`p-2.5 rounded-xl ${soldeNet >= 0 ? 'bg-green-500/10 text-green-400' : 'bg-rose-500/10 text-rose-400'}`}>
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <p className="text-white/30 text-[9px] font-black uppercase tracking-widest mb-0.5">Solde Net (revenus - dépenses)</p>
            <p className={`text-lg font-black ${soldeNet >= 0 ? 'text-green-400' : 'text-rose-400'}`}>
              €{soldeNet.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Top Service ── */}
      {topService && (
        <div className="bg-[#141414] border border-white/5 p-6 rounded-3xl flex items-center gap-5">
          <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-2xl flex items-center justify-center shrink-0">
            <Award className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <div>
            <p className="text-[10px] text-white/40 font-black uppercase tracking-widest mb-1">Service Le Plus Demandé</p>
            <p className="text-xl font-black text-white">{topService.name}</p>
            <p className="text-sm text-white/50">{topService.count} fois ({periodLabels[periodFilter]})</p>
          </div>
        </div>
      )}


      {/* ── Revenue Trend (14 days) ── */}
      <div className="bg-[#141414] border border-white/5 p-6 rounded-3xl">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-green-400" /> Tendance Revenus — 14 Derniers Jours
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={revenueTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="date" stroke="#4a4a4a" tick={{ fontSize: 11 }} />
            <YAxis stroke="#4a4a4a" tick={{ fontSize: 11 }} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="Revenus €" stroke="#D4AF37" strokeWidth={3} dot={false} />
            <Line type="monotone" dataKey="Services" stroke="#60a5fa" strokeWidth={2} dot={false} strokeDasharray="4 2" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Historique des Services ── */}
      <div className="bg-[#141414] border border-white/5 rounded-3xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[#D4AF37]" />
            <h3 className="text-lg font-bold">Historique des Services</h3>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-6 border-b border-white/5 bg-white/[0.01] grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Du</label>
            <input
              type="date"
              value={histStartDate}
              onChange={e => setHistStartDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#D4AF37] text-xs text-white [color-scheme:dark]"
            />
          </div>
          
          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Au</label>
            <input
              type="date"
              value={histEndDate}
              onChange={e => setHistEndDate(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#D4AF37] text-xs text-white [color-scheme:dark]"
            />
          </div>

          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Coiffeur</label>
            <select
              value={histBarberId}
              onChange={e => setHistBarberId(e.target.value)}
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#D4AF37] text-xs text-white"
            >
              <option value="all">Tous</option>
              {barbers.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Service</label>
            <select
              value={histServiceId}
              onChange={e => setHistServiceId(e.target.value)}
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#D4AF37] text-xs text-white"
            >
              <option value="all">Tous</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Paiement</label>
            <select
              value={histPaymentMethod}
              onChange={e => setHistPaymentMethod(e.target.value)}
              className="w-full bg-[#141414] border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#D4AF37] text-xs text-white"
            >
              <option value="all">Tous</option>
              <option value="cash">Espèce</option>
              <option value="card">Carte</option>
            </select>
          </div>

          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Rechercher</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nom client..."
                value={histSearch}
                onChange={e => setHistSearch(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 outline-none focus:border-[#D4AF37] text-xs text-white placeholder-white/20"
              />
              <button
                onClick={handleResetFilters}
                className="px-3 py-2 border border-white/10 hover:border-[#D4AF37] hover:text-[#D4AF37] rounded-xl text-xs transition-colors shrink-0 text-white/60 font-black uppercase"
                title="Réinitialiser les filtres"
              >
                Réinit.
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] text-white/30 text-[10px] uppercase tracking-widest border-b border-white/5">
                <th className="px-6 py-4">Date / Heure</th>
                <th className="px-6 py-4">Coiffeur</th>
                <th className="px-6 py-4">Client</th>
                <th className="px-6 py-4">Service</th>
                <th className="px-6 py-4">Prix</th>
                <th className="px-6 py-4">Pourboire</th>
                <th className="px-6 py-4">Paiement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {paginatedServices.map((b) => {
                const barber = barbers.find(bb => bb.id === b.barberId);
                const service = services.find(s => s.id === b.serviceId);
                const clientName = b.clientName || 'Walk-in';
                
                return (
                  <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-white font-bold text-sm">{b.date}</p>
                      <p className="text-white/40 text-xs">{b.time}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <img
                          src={barber?.image || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&h=60&fit=crop'}
                          className="w-6 h-6 rounded-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&h=60&fit=crop'; }}
                        />
                        <span className="text-white/80 text-sm font-medium">{barber?.name || 'Inconnu'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-white font-medium">{clientName}</td>
                    <td className="px-6 py-4 text-sm text-white/80">{service?.name || 'Service Personnalisé'}</td>
                    <td className="px-6 py-4 font-bold text-[#D4AF37]">€{(b.pricePaid || 0).toFixed(2)}</td>
                    <td className="px-6 py-4 font-bold text-amber-400">€{(b.tip || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      {b.paymentMethod === 'cash' ? (
                        <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-lg text-[10px] font-black uppercase">Espèce</span>
                      ) : b.paymentMethod === 'card' ? (
                        <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-[10px] font-black uppercase">Carte</span>
                      ) : (
                        <span className="px-2 py-1 bg-white/10 text-white/40 rounded-lg text-[10px] font-black uppercase">Inconnu</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paginatedServices.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-white/20 italic">Aucun service ne correspond à ces critères.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between gap-4 flex-wrap bg-white/[0.01]">
            <span className="text-xs text-white/40 font-medium">
              {totalItems} {totalItems > 1 ? 'services au total' : 'service au total'}
            </span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setHistPage(p => Math.max(1, p - 1))}
                disabled={histPage === 1}
                className="px-4 py-2 border border-white/10 hover:border-[#D4AF37] disabled:hover:border-white/10 disabled:opacity-40 rounded-xl text-xs font-black transition-colors text-white uppercase"
              >
                Précédent
              </button>
              <span className="text-xs text-white font-medium">
                Page {histPage} sur {totalPages}
              </span>
              <button
                onClick={() => setHistPage(p => Math.min(totalPages, p + 1))}
                disabled={histPage === totalPages}
                className="px-4 py-2 border border-white/10 hover:border-[#D4AF37] disabled:hover:border-white/10 disabled:opacity-40 rounded-xl text-xs font-black transition-colors text-white uppercase"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Revenue per Barber bar chart + Service distribution pie ── */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-[#141414] border border-white/5 p-6 rounded-3xl">
          <h3 className="text-base font-bold mb-6 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-[#D4AF37]" /> Revenus par Coiffeur
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barberStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#262626" horizontal={false} />
              <XAxis type="number" stroke="#4a4a4a" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" stroke="#4a4a4a" tick={{ fontSize: 11 }} width={80} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="revenue" name="Revenus €" radius={[0, 6, 6, 0]}>
                {barberStats.map((_, i) => (
                  <Cell key={i} fill={GOLD_COLORS[i % GOLD_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[#141414] border border-white/5 p-6 rounded-3xl">
          <h3 className="text-base font-bold mb-6 flex items-center gap-2">
            <Scissors className="w-4 h-4 text-[#D4AF37]" /> Services les Plus Demandés
          </h3>
          {serviceStats.every(s => s.count === 0) ? (
            <div className="h-[220px] flex items-center justify-center text-white/20 italic text-sm">
              Aucun service enregistré sur cette période.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={serviceStats.filter(s => s.count > 0)}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {serviceStats.map((_, i) => (
                    <Cell key={i} fill={GOLD_COLORS[i % GOLD_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Weekly activity heatmap by barber ── */}
      <div className="bg-[#141414] border border-white/5 p-6 rounded-3xl">
        <h3 className="text-base font-bold mb-6 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[#D4AF37]" /> Activité Journalière — 7 Derniers Jours
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weeklyByBarber}>
            <CartesianGrid strokeDasharray="3 3" stroke="#262626" />
            <XAxis dataKey="date" stroke="#4a4a4a" tick={{ fontSize: 11 }} />
            <YAxis stroke="#4a4a4a" tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
            {barbers.map((b, i) => (
              <Bar key={b.id} dataKey={String(b.name || '')} stackId="a" fill={GOLD_COLORS[i % GOLD_COLORS.length]} radius={i === barbers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Payment breakdown ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            label: 'Paiements Espèces',
            icon: Wallet,
            color: 'text-green-400',
            bg: 'bg-green-500/10',
            value: `€${filtered.filter(b => b.paymentMethod === 'cash').reduce((s, b) => s + (b.pricePaid || 0), 0).toFixed(2)}`,
            count: filtered.filter(b => b.paymentMethod === 'cash').length,
          },
          {
            label: 'Paiements Carte',
            icon: CreditCard,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            value: `€${filtered.filter(b => b.paymentMethod === 'card').reduce((s, b) => s + (b.pricePaid || 0), 0).toFixed(2)}`,
            count: filtered.filter(b => b.paymentMethod === 'card').length,
          },
          {
            label: 'Non Payés',
            icon: AlertCircle,
            color: 'text-red-400',
            bg: 'bg-red-500/10',
            value: `${bookings.filter(b => (b as any).paymentStatus === 'unpaid' && (b.status === 'approved' || b.status === 'completed')).length} RDV`,
            count: null,
          },
        ].map(({ label, icon: Icon, color, bg, value, count }) => (
          <div key={label} className="bg-[#141414] border border-white/5 p-5 rounded-2xl flex items-center gap-4">
            <div className={`p-3 rounded-2xl ${bg} ${color}`}><Icon className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] text-white/30 font-black uppercase tracking-widest">{label}</p>
              <p className="text-2xl font-black text-white">{value}</p>
              {count !== null && <p className="text-xs text-white/40">{count} transactions</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
