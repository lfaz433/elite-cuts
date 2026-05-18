import { useMemo, useState } from 'react';
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
}

const GOLD_COLORS = ['#D4AF37', '#FFD700', '#B8960C', '#F5E050', '#C8A415', '#EAC730', '#A0830A'];

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

export function BarberAnalytics({ bookings, barbers, services, attendance }: Props) {
  const [periodFilter, setPeriodFilter] = useState<'day' | 'week' | 'month' | 'custom'>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

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
    const revenue = filtered.reduce((s, b) => s + (b.pricePaid || 0), 0);
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
    const prevRev = prevMonthBookings.reduce((s, b) => s + (b.pricePaid || 0), 0);
    const revTrend = prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : 0;

    return { revenue, tips, total: revenue + tips, avecRdv, sansRdv, count: filtered.length, avgDuration, revTrend };
  }, [filtered, bookings, services]);

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

      return {
        id: barber.id,
        name: barber.name,
        image: barber.image,
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
    return services.map(s => ({ name: s.name, count: map[s.id] || 0 }))
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
        date: date.slice(5),
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
      const row: Record<string, any> = { date: date.slice(5) };
      barbers.forEach(b => {
        row[b.name] = filtered.filter(bk => bk.date === date && bk.barberId === b.id).length;
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Chiffre d'Affaires" value={`€${kpis.revenue.toFixed(0)}`} sub={`+€${kpis.tips.toFixed(0)} pourboires`} icon={DollarSign} color="text-green-400" bg="bg-green-500/10" trend={kpis.revTrend} />
        <StatCard label="Services Réalisés" value={kpis.count} sub={`${kpis.avecRdv} RDV · ${kpis.sansRdv} Walk-in`} icon={Scissors} color="text-[#D4AF37]" bg="bg-[#D4AF37]/10" />
        <StatCard label="Total Pourboires" value={`€${kpis.tips.toFixed(0)}`} sub="Collectés par les coiffeurs" icon={Wallet} color="text-amber-400" bg="bg-amber-500/10" />
        <StatCard label="Durée Moy. Service" value={`${Math.round(kpis.avgDuration)} min`} sub="Temps moyen par prestation" icon={Clock} color="text-blue-400" bg="bg-blue-500/10" />
      </div>

      {/* ── Champion & Top Service ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {topBarber && (
          <div className="bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 border border-[#D4AF37]/25 p-6 rounded-3xl flex items-center gap-5">
            <div className="relative shrink-0">
              <img
                src={topBarber.image || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-[#D4AF37]/50"
                onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop'; }}
              />
              <div className="absolute -top-2 -right-2 w-7 h-7 bg-[#D4AF37] rounded-full flex items-center justify-center">
                <Trophy className="w-4 h-4 text-black" />
              </div>
            </div>
            <div>
              <p className="text-[10px] text-[#D4AF37] font-black uppercase tracking-widest mb-1">🏆 Meilleur Performeur</p>
              <p className="text-xl font-black text-white">{topBarber.name}</p>
              <p className="text-sm text-white/50">€{topBarber.revenue.toFixed(0)} · {topBarber.count} services</p>
            </div>
          </div>
        )}
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
      </div>

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

      {/* ── Per-Barber Stats Table ── */}
      <div className="bg-[#141414] border border-white/5 rounded-3xl overflow-hidden">
        <div className="px-6 py-5 border-b border-white/5 flex items-center gap-3">
          <Users className="w-5 h-5 text-[#D4AF37]" />
          <h3 className="text-lg font-bold">Performance par Coiffeur</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/[0.02] text-white/30 text-[10px] uppercase tracking-widest border-b border-white/5">
                <th className="px-6 py-4">Coiffeur</th>
                <th className="px-6 py-4">Services</th>
                <th className="px-6 py-4">Avec RDV</th>
                <th className="px-6 py-4">Walk-in</th>
                <th className="px-6 py-4">Revenus Bruts</th>
                <th className="px-6 py-4">Part Coiffeur</th>
                <th className="px-6 py-4">Pourboires</th>
                <th className="px-6 py-4">Présences</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {barberStats.map((b, i) => (
                <tr key={b.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {i === 0 && <Trophy className="w-4 h-4 text-[#D4AF37] shrink-0" />}
                      <img
                        src={b.image || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&h=60&fit=crop'}
                        className="w-8 h-8 rounded-xl object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60&h=60&fit=crop'; }}
                      />
                      <span className="font-bold text-sm text-white">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-black text-white">{b.count}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded-lg text-[10px] font-black">{b.avecRdv}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded-lg text-[10px] font-black">{b.sansRdv}</span>
                  </td>
                  <td className="px-6 py-4 font-bold text-[#D4AF37]">€{b.revenue.toFixed(2)}</td>
                  <td className="px-6 py-4 font-bold text-green-400">€{b.barberShare.toFixed(2)}</td>
                  <td className="px-6 py-4 font-bold text-amber-400">€{b.tips.toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <span className="text-white/60 font-bold">{b.attendCount}j</span>
                  </td>
                </tr>
              ))}
              {barberStats.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-white/20 italic">Aucune donnée pour cette période.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
              <Bar key={b.id} dataKey={b.name} stackId="a" fill={GOLD_COLORS[i % GOLD_COLORS.length]} radius={i === barbers.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
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
