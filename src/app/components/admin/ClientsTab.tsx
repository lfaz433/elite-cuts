import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, User, Calendar, DollarSign, Megaphone, 
  Clock, Plus, Trash2, Scissors, Award, X, Copy, Mail, Phone 
} from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '../context/BusinessContext';

export default function ClientsTab() {
  const { 
    bookings, services, barbers, registeredClients, 
    clientNotes, updateClientNote, campaigns, addCampaign, deleteCampaign 
  } = useBusiness();

  const [activeSubTab, setActiveSubTab] = useState<'directory' | 'marketing'>('directory');
  const [searchQuery, setSearchQuery] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'vip' | 'new' | 'inactive'>('all');
  const [selectedClient, setSelectedClient] = useState<any>(null);
  
  // Note editing state
  const [editingNotes, setEditingNotes] = useState('');
  const [editingVip, setEditingVip] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // Campaign builder state
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignDesc, setCampaignDesc] = useState('');
  const [campaignCode, setCampaignCode] = useState('');
  const [campaignDiscount, setCampaignDiscount] = useState<number>(10);
  const [campaignSegment, setCampaignSegment] = useState<'all' | 'new' | 'inactive' | 'vip'>('all');
  const [isSubmittingCampaign, setIsSubmittingCampaign] = useState(false);

  // --- Dynamic Customer Directory Compiler ---
  const compiledClients = useMemo(() => {
    const clientsMap = new Map<string, any>();

    // Index to map aliases (email, un-normalized phone, UID) to the main clientKey
    const idMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    const phoneMap = new Map<string, string>();

    // 1. Process all registered clients first
    (registeredClients || []).forEach(c => {
      const normalizedPhone = c.phone ? c.phone.replace(/[^0-9+]/g, '') : '';
      const clientKey = normalizedPhone || c.email || c.uid;
      
      if (c.uid) idMap.set(c.uid, clientKey);
      if (c.email) emailMap.set(c.email, clientKey);
      if (normalizedPhone) phoneMap.set(normalizedPhone, clientKey);

      const noteDoc = clientNotes?.find(n => n.phone === normalizedPhone);

      clientsMap.set(clientKey, {
        id: c.uid,
        name: c.name,
        email: c.email || '—',
        phone: c.phone || '—',
        normalizedPhone,
        isRegistered: true,
        createdAt: c.createdAt || '',
        totalVisits: 0,
        totalSpent: 0,
        lastVisit: null,
        servicesCount: {} as Record<string, number>,
        barbersCount: {} as Record<string, number>,
        notes: noteDoc?.notes || '',
        manualVip: noteDoc?.isVip || false,
        bookingsList: []
      });
    });

    // 2. Process all bookings to aggregate stats and discover unregistered clients
    (bookings || []).forEach(b => {
      if (b.status === 'rejected') return; // Skip cancelled appointments
      
      const normalizedPhone = b.clientPhone ? b.clientPhone.replace(/[^0-9+]/g, '') : '';
      
      let clientKey = '';
      if (b.clientId && idMap.has(b.clientId)) clientKey = idMap.get(b.clientId)!;
      else if (normalizedPhone && phoneMap.has(normalizedPhone)) clientKey = phoneMap.get(normalizedPhone)!;
      else if (b.clientEmail && emailMap.has(b.clientEmail)) clientKey = emailMap.get(b.clientEmail)!;
      else clientKey = normalizedPhone || b.clientEmail || b.clientId;

      if (!clientKey) return;

      let clientProfile = clientsMap.get(clientKey);
      
      if (!clientProfile) {
        const noteDoc = clientNotes?.find(n => n.phone === normalizedPhone);

        clientProfile = {
          id: b.clientId || `guest_${Math.random().toString(36).substring(2, 11)}`,
          name: b.clientName || 'Client Anonyme',
          email: b.clientEmail || '—',
          phone: b.clientPhone || '—',
          normalizedPhone,
          isRegistered: false,
          createdAt: b.createdAt || '',
          totalVisits: 0,
          totalSpent: 0,
          lastVisit: null,
          servicesCount: {} as Record<string, number>,
          barbersCount: {} as Record<string, number>,
          notes: noteDoc?.notes || '',
          manualVip: noteDoc?.isVip || false,
          bookingsList: []
        };
        clientsMap.set(clientKey, clientProfile);

        if (b.clientId) idMap.set(b.clientId, clientKey);
        if (b.clientEmail) emailMap.set(b.clientEmail, clientKey);
        if (normalizedPhone) phoneMap.set(normalizedPhone, clientKey);
      }

      // Update missing phone info
      if (clientProfile.phone === '—' && b.clientPhone) {
        clientProfile.phone = b.clientPhone;
        clientProfile.normalizedPhone = normalizedPhone;
        if (normalizedPhone) phoneMap.set(normalizedPhone, clientKey);
      }

      // Add booking details
      clientProfile.bookingsList.push(b);
      clientProfile.totalVisits += 1;
      
      if (b.status === 'completed') {
        const targetService = services.find(s => s.id === b.serviceId);
        const servicePrice = targetService ? parseFloat(targetService.price.replace(/[^0-9]/g, '')) : 25;
        const paid = Number(b.pricePaid || servicePrice);
        const tip = Number(b.tip || 0);
        clientProfile.totalSpent += (paid + tip);
      }

      if (b.serviceId) {
        clientProfile.servicesCount[b.serviceId] = (clientProfile.servicesCount[b.serviceId] || 0) + 1;
      }

      if (b.barberId) {
        clientProfile.barbersCount[b.barberId] = (clientProfile.barbersCount[b.barberId] || 0) + 1;
      }

      if (!clientProfile.lastVisit || b.date > clientProfile.lastVisit) {
        clientProfile.lastVisit = b.date;
      }
    });

    // 3. Convert Map to Array & calculate favorites + segments
    return Array.from(clientsMap.values()).map(client => {
      let favoriteServiceId = '';
      let maxServiceCount = 0;
      Object.entries(client.servicesCount).forEach(([id, count]) => {
        if ((count as number) > maxServiceCount) {
          maxServiceCount = count as number;
          favoriteServiceId = id;
        }
      });
      const favoriteService = services.find(s => s.id === favoriteServiceId)?.name || '—';

      let favoriteBarberId = '';
      let maxBarberCount = 0;
      Object.entries(client.barbersCount).forEach(([id, count]) => {
        if ((count as number) > maxBarberCount) {
          maxBarberCount = count as number;
          favoriteBarberId = id;
        }
      });
      const favoriteBarber = barbers.find(b => b.id === favoriteBarberId)?.name || '—';

      // Dynamic Segment Logic
      let segment: 'vip' | 'new' | 'inactive' | 'active' = 'active';
      const daysSinceLastVisit = client.lastVisit 
        ? Math.floor((Date.now() - new Date(client.lastVisit).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      
      const createdDaysAgo = client.createdAt 
        ? Math.floor((Date.now() - new Date(client.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      if (client.manualVip || client.totalVisits > 5) {
        segment = 'vip';
      } else if (daysSinceLastVisit > 30 && client.lastVisit !== null) {
        segment = 'inactive';
      } else if (createdDaysAgo <= 14) {
        segment = 'new';
      }

      return {
        ...client,
        favoriteService,
        favoriteBarber,
        segment
      };
    });
  }, [registeredClients, bookings, services, barbers, clientNotes]);

  // --- Filtering & Searching ---
  const filteredClients = useMemo(() => {
    return compiledClients.filter(c => {
      const matchesQuery = 
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.phone.includes(searchQuery);

      const matchesSegment = segmentFilter === 'all' || c.segment === segmentFilter;

      return matchesQuery && matchesSegment;
    });
  }, [compiledClients, searchQuery, segmentFilter]);

  // --- Metrics Ribbon Values ---
  const metrics = useMemo(() => {
    const total = compiledClients.length;
    const vip = compiledClients.filter(c => c.segment === 'vip').length;
    const isNew = compiledClients.filter(c => c.segment === 'new').length;
    const inactive = compiledClients.filter(c => c.segment === 'inactive').length;
    return { total, vip, isNew, inactive };
  }, [compiledClients]);

  const handleOpenClientDetail = (client: any) => {
    setSelectedClient(client);
    setEditingNotes(client.notes || '');
    setEditingVip(client.manualVip || false);
  };

  const handleSaveNotes = async () => {
    if (!selectedClient) return;
    setIsSavingNotes(true);
    try {
      await updateClientNote(selectedClient.normalizedPhone || selectedClient.phone, editingNotes, editingVip);
      toast.success("Notes du client mises à jour !");
      
      // Update in local selection state
      setSelectedClient((prev: any) => ({ 
        ...prev, 
        notes: editingNotes,
        manualVip: editingVip,
        segment: (editingVip || prev.totalVisits > 5) ? 'vip' : prev.segment
      }));
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de l'enregistrement des notes.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignTitle || !campaignDesc) {
      toast.error("Veuillez remplir le titre et la description de la campagne.");
      return;
    }
    setIsSubmittingCampaign(true);
    try {
      await addCampaign({
        title: campaignTitle,
        description: campaignDesc,
        couponCode: campaignCode || undefined,
        discountAmount: campaignCode ? campaignDiscount : undefined,
        segment: campaignSegment,
        status: 'active'
      });
      toast.success("🎉 Campagne marketing créée avec succès ! Les clients cibles la verront sur leur espace.");
      setCampaignTitle('');
      setCampaignDesc('');
      setCampaignCode('');
      setCampaignDiscount(10);
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de la création de la campagne.");
    } finally {
      setIsSubmittingCampaign(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Voulez-vous vraiment désactiver cette campagne marketing ?")) return;
    try {
      await deleteCampaign(id);
      toast.success("Campagne désactivée.");
    } catch (err: any) {
      console.error(err);
      toast.error("Erreur lors de la désactivation.");
    }
  };

  // --- Display Names Mapping ---
  const segmentLabels: Record<string, string> = {
    all: 'Tous les Clients',
    vip: 'VIP / Super Clients',
    new: 'Nouveaux (14j)',
    inactive: 'À Relancer (30j+)',
    active: 'Actifs'
  };

  const segmentColors: Record<string, string> = {
    vip: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    new: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    inactive: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    active: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 pb-20">
      
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tight">Espace Clients & Marketing</h2>
          <p className="text-white/40 text-sm mt-1">Gérez votre base de clients, analysez leur assiduité et créez des campagnes de fidélisation.</p>
        </div>
        
        {/* Navigation buttons inside Clients page */}
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
          <button 
            onClick={() => setActiveSubTab('directory')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${activeSubTab === 'directory' ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/10' : 'text-white/40 hover:text-white'}`}
          >
            Fichier Clients
          </button>
          <button 
            onClick={() => setActiveSubTab('marketing')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${activeSubTab === 'marketing' ? 'bg-[#D4AF37] text-black shadow-lg shadow-[#D4AF37]/10' : 'text-white/40 hover:text-white'}`}
          >
            Campagnes Marketing
          </button>
        </div>
      </div>

      {/* --- SUB TAB 1: CLIENT DIRECTORY --- */}
      {activeSubTab === 'directory' && (
        <div className="space-y-6">
          
          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Clients', val: metrics.total, desc: 'Profils uniques compilés', Icon: User, col: '#D4AF37' },
              { label: 'VIP (Super Clients)', val: metrics.vip, desc: 'Plus de 5 rendez-vous', Icon: Award, col: '#fbbf24' },
              { label: 'Nouveaux', val: metrics.isNew, desc: 'Inscrits ou venus depuis 14j', Icon: Calendar, col: '#34d399' },
              { label: 'Inactifs à Relancer', val: metrics.inactive, desc: 'Aucune visite depuis 30j', Icon: Clock, col: '#f87171' },
            ].map((m, i) => (
              <div key={i} className="bg-[#141414] border border-white/5 p-5 rounded-[1.8rem] relative overflow-hidden group">
                <div className="p-2.5 rounded-xl w-fit mb-3 transition-transform group-hover:scale-110" style={{ background: `${m.col}15`, color: m.col }}>
                  <m.Icon className="w-5 h-5" />
                </div>
                <p className="text-white/30 text-[9px] font-black uppercase tracking-wider">{m.label}</p>
                <p className="text-3xl font-black mt-1" style={{ color: m.col }}>{m.val}</p>
                <p className="text-[10px] text-white/40 mt-1 italic">{m.desc}</p>
              </div>
            ))}
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-[#141414] border border-white/5 p-4 rounded-[1.8rem] flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-3.5 w-4 h-4 text-white/30" />
              <input
                type="text"
                placeholder="Rechercher par nom, email, téléphone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl pl-10 pr-4 py-3 outline-none text-white focus:border-[#D4AF37] font-semibold text-sm transition-all"
              />
            </div>
            
            <div className="flex items-center gap-3 w-full md:w-auto">
              <span className="text-xs text-white/40 font-bold uppercase tracking-wider shrink-0 hidden sm:inline">Segment :</span>
              <select
                value={segmentFilter}
                onChange={e => setSegmentFilter(e.target.value as any)}
                className="w-full md:w-56 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 outline-none text-white focus:border-[#D4AF37] font-bold text-xs"
              >
                <option value="all" className="bg-[#141414]">Tous les clients</option>
                <option value="vip" className="bg-[#141414]">VIP (Super Clients)</option>
                <option value="new" className="bg-[#141414]">Nouveaux</option>
                <option value="inactive" className="bg-[#141414]">Inactifs (À relancer)</option>
              </select>
            </div>
          </div>

          {/* Clients List Table */}
          <div className="bg-[#141414] border border-white/5 rounded-[2rem] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-white/30 text-[10px] font-black uppercase tracking-widest bg-white/[0.01]">
                    <th className="py-5 px-6">Client</th>
                    <th className="py-5 px-6">Statut / Segment</th>
                    <th className="py-5 px-6 text-center">Rendez-vous</th>
                    <th className="py-5 px-6 text-right">Montant Dépensé</th>
                    <th className="py-5 px-6">Coiffeur Favori</th>
                    <th className="py-5 px-6">Dernière Visite</th>
                    <th className="py-5 px-6 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-white/30 font-medium italic text-sm">
                        Aucun client trouvé correspondant aux critères.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map((client, idx) => (
                      <tr key={idx} className="hover:bg-white/[0.02] transition-colors text-sm group">
                        <td className="py-4.5 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-white/5 text-white font-bold flex items-center justify-center border border-white/10 uppercase">
                              {client.name.substring(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-white group-hover:text-[#D4AF37] transition-colors">{client.name}</div>
                              <div className="text-white/40 text-xs mt-0.5">{client.email} • {client.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-4.5 px-6">
                          <div className="flex flex-wrap gap-1.5">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${segmentColors[client.segment]}`}>
                              {segmentLabels[client.segment]}
                            </span>
                            {client.isRegistered ? (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 uppercase">
                                Enregistré
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/5 text-white/40 border border-white/10 uppercase">
                                Invité
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4.5 px-6 text-center font-extrabold text-white">
                          {client.totalVisits}
                        </td>
                        <td className="py-4.5 px-6 text-right font-black text-[#D4AF37]">
                          €{client.totalSpent.toFixed(2)}
                        </td>
                        <td className="py-4.5 px-6 font-semibold text-white/80">
                          {client.favoriteBarber}
                        </td>
                        <td className="py-4.5 px-6 text-white/60 font-medium">
                          {client.lastVisit ? new Date(client.lastVisit).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="py-4.5 px-6 text-center">
                          <button
                            onClick={() => handleOpenClientDetail(client)}
                            className="px-4 py-2 bg-white/5 hover:bg-[#D4AF37] hover:text-black rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                          >
                            Détails & Notes
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- SUB TAB 2: MARKETING CAMPAIGNS --- */}
      {activeSubTab === 'marketing' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Campaign Builder Card */}
          <div className="lg:col-span-1 bg-[#141414] border border-white/5 p-8 rounded-[2.5rem] space-y-6 h-fit">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center">
                <Megaphone className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Créer une Campagne</h3>
                <p className="text-xs text-white/40">Fidélisez votre clientèle avec des remises ciblées.</p>
              </div>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              <div>
                <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Titre de la Campagne</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: -15% sur votre Coupe Simple !"
                  value={campaignTitle}
                  onChange={e => setCampaignTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-white focus:border-[#D4AF37] font-medium text-sm transition-all"
                />
              </div>

              <div>
                <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Message / Offre</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Écrivez le message de l'offre promotionnelle pour le client..."
                  value={campaignDesc}
                  onChange={e => setCampaignDesc(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-white focus:border-[#D4AF37] font-medium text-sm transition-all resize-none"
                />
              </div>

              <div>
                <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Segment Cible</label>
                <select
                  value={campaignSegment}
                  onChange={e => setCampaignSegment(e.target.value as any)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-white focus:border-[#D4AF37] font-bold text-xs"
                >
                  <option value="all">Tous les clients</option>
                  <option value="vip">Super Clients (VIP)</option>
                  <option value="new">Nouveaux clients</option>
                  <option value="inactive">Clients inactifs</option>
                </select>
              </div>

              <div className="pt-2 border-t border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-white/40 text-xs font-bold uppercase tracking-wider">Créer un code promo ?</span>
                  <input 
                    type="checkbox"
                    checked={!!campaignCode}
                    onChange={(e) => setCampaignCode(e.target.checked ? 'CODE' : '')}
                    className="w-4 h-4 accent-[#D4AF37] cursor-pointer"
                  />
                </div>

                {campaignCode !== '' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 pt-1">
                    <div>
                      <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Code de Coupon</label>
                      <input
                        type="text"
                        required
                        placeholder="Ex: VIP15"
                        value={campaignCode === 'CODE' ? '' : campaignCode}
                        onChange={e => setCampaignCode(e.target.value.toUpperCase())}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-[#D4AF37] focus:border-[#D4AF37] font-black text-sm transition-all tracking-wider"
                      />
                    </div>
                    <div>
                      <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-1.5">Montant de Remise (%)</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="5"
                          max="50"
                          step="5"
                          value={campaignDiscount}
                          onChange={e => setCampaignDiscount(parseInt(e.target.value))}
                          className="flex-1 accent-[#D4AF37]"
                        />
                        <span className="w-12 text-center text-sm font-black text-[#D4AF37] bg-[#D4AF37]/10 py-1.5 rounded-lg border border-[#D4AF37]/20">
                          {campaignDiscount}%
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmittingCampaign}
                className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] disabled:from-[#D4AF37]/50 disabled:to-[#FFD700]/50 text-black rounded-2xl font-black text-sm uppercase tracking-wider shadow-lg shadow-[#D4AF37]/10 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-4"
              >
                {isSubmittingCampaign ? 'Création...' : '📢 Envoyer la Campagne'}
              </button>
            </form>
          </div>

          {/* Active Campaigns List Panel */}
          <div className="lg:col-span-2 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2 text-white">
              <Megaphone className="w-5 h-5 text-[#D4AF37]" /> Campagnes Actives
            </h3>
            
            {campaigns.length === 0 ? (
              <div className="text-center py-20 bg-[#141414] border border-white/5 rounded-[2rem] border-dashed">
                <Megaphone className="w-12 h-12 text-white/10 mx-auto mb-4" />
                <p className="text-white/40 font-medium italic text-sm">Aucune campagne marketing active pour le moment.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {campaigns.map(camp => (
                  <div key={camp.id} className="bg-[#141414] border border-white/5 p-6 rounded-[2rem] space-y-4 hover:border-[#D4AF37]/20 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider ${segmentColors[camp.segment]}`}>
                          Cible : {segmentLabels[camp.segment]}
                        </span>
                        <button
                          onClick={() => handleDeleteCampaign(camp.id)}
                          className="p-1.5 hover:bg-red-500/10 rounded-xl transition-all text-white/30 hover:text-red-500"
                          title="Supprimer la campagne"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <h4 className="text-lg font-black text-white mt-3">{camp.title}</h4>
                      <p className="text-white/60 text-xs mt-2 leading-relaxed">{camp.description}</p>
                    </div>

                    {camp.couponCode && (
                      <div className="bg-white/[0.03] border border-white/5 p-3 rounded-xl flex items-center justify-between mt-4">
                        <div>
                          <p className="text-[8px] text-white/30 font-black uppercase tracking-wider">Code promo</p>
                          <p className="text-sm font-black text-[#D4AF37] tracking-wider">{camp.couponCode}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] text-white/30 font-black uppercase tracking-wider">Remise</p>
                          <p className="text-sm font-black text-emerald-400">-{camp.discountAmount}%</p>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- CLIENT DETAIL & HISTORY DRAWER/MODAL --- */}
      <AnimatePresence>
        {selectedClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#141414] border border-[#D4AF37]/20 rounded-[2.5rem] w-full max-w-4xl max-h-[85vh] overflow-y-auto relative flex flex-col md:flex-row"
            >
              {/* Close Button */}
              <button 
                onClick={() => setSelectedClient(null)} 
                className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all text-white/40 hover:text-white z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Sidebar Info & Notes */}
              <div className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/5 p-8 flex flex-col justify-between shrink-0 bg-white/[0.01]">
                <div className="space-y-6">
                  {/* Avatar Profile */}
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-20 h-20 rounded-[1.8rem] bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 font-black text-2xl flex items-center justify-center uppercase shadow-2xl">
                      {selectedClient.name.substring(0, 2)}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white leading-tight">{selectedClient.name}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold border uppercase tracking-wider inline-block mt-2 ${segmentColors[selectedClient.segment]}`}>
                        {segmentLabels[selectedClient.segment]}
                      </span>
                    </div>
                  </div>

                  {/* Contact list */}
                  <div className="space-y-3 pt-4 border-t border-white/5 text-xs text-white/60">
                    <div className="flex items-center gap-2.5">
                      <Mail className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span className="truncate">{selectedClient.email}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Phone className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span>{selectedClient.phone}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <Calendar className="w-4 h-4 text-[#D4AF37] shrink-0" />
                      <span>Inscrit : {selectedClient.createdAt ? new Date(selectedClient.createdAt).toLocaleDateString('fr-FR') : '—'}</span>
                    </div>
                  </div>

                  {/* Client Stats Blocks */}
                  <div className="grid grid-cols-2 gap-2 pt-4 border-t border-white/5">
                    <div className="bg-white/5 p-3 rounded-2xl text-center border border-white/5">
                      <p className="text-[8px] text-white/30 font-black uppercase tracking-wider">Visites</p>
                      <p className="text-xl font-black text-[#D4AF37] mt-0.5">{selectedClient.totalVisits}</p>
                    </div>
                    <div className="bg-white/5 p-3 rounded-2xl text-center border border-white/5">
                      <p className="text-[8px] text-white/30 font-black uppercase tracking-wider">Total Payé</p>
                      <p className="text-xl font-black text-emerald-400 mt-0.5">€{selectedClient.totalSpent.toFixed(0)}</p>
                    </div>
                  </div>
                </div>

                {/* Admin Notes Section */}
                <div className="space-y-3 pt-6 md:pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white/30 text-[10px] font-black uppercase tracking-widest">Notes du Coiffeur (Admin)</label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={editingVip}
                        onChange={(e) => setEditingVip(e.target.checked)}
                        className="accent-[#D4AF37] w-3.5 h-3.5 cursor-pointer"
                      />
                      <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-wider">Client VIP</span>
                    </label>
                  </div>
                  <textarea
                    rows={4}
                    placeholder="Ajoutez des notes privées sur les préférences de ce client (ex: longueur du sabot, boisson favorite...)"
                    value={editingNotes}
                    onChange={e => setEditingNotes(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 outline-none text-white focus:border-[#D4AF37] font-medium text-xs resize-none"
                  />
                  <button
                    onClick={handleSaveNotes}
                    disabled={isSavingNotes}
                    className="w-full py-3 bg-[#D4AF37] disabled:bg-[#D4AF37]/50 text-black rounded-xl font-black text-xs uppercase tracking-wider transition-all"
                  >
                    {isSavingNotes ? 'Enregistrement...' : '✓ Enregistrer les Notes'}
                  </button>
                </div>
              </div>

              {/* Booking History Table */}
              <div className="flex-1 p-8 flex flex-col justify-between">
                <div>
                  <h3 className="text-xl font-black uppercase tracking-tight mb-6">Historique des Rendez-vous</h3>
                  
                  {selectedClient.bookingsList.length === 0 ? (
                    <div className="text-center py-20 bg-white/[0.02] border border-white/5 rounded-[2rem] border-dashed">
                      <Calendar className="w-12 h-12 text-white/10 mx-auto mb-4" />
                      <p className="text-white/40 font-medium italic text-xs">Aucun rendez-vous enregistré pour ce client.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[50vh] overflow-y-auto rounded-2xl border border-white/5">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/5 text-white/30 font-black uppercase tracking-widest bg-white/[0.01]">
                            <th className="py-4 px-4">Date & Heure</th>
                            <th className="py-4 px-4">Service</th>
                            <th className="py-4 px-4">Coiffeur</th>
                            <th className="py-4 px-4 text-right">Montant</th>
                            <th className="py-4 px-4 text-center">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {selectedClient.bookingsList.map((b: any, idx: number) => {
                            const service = services.find(s => s.id === b.serviceId);
                            const barber = barbers.find(ba => ba.id === b.barberId);
                            
                            const statusLabels: Record<string, string> = {
                              pending: 'En attente',
                              approved: 'Confirmé',
                              completed: 'Terminé',
                              rejected: 'Annulé',
                            };
                            
                            const statusColors: Record<string, string> = {
                              pending: 'bg-yellow-500/10 text-yellow-400',
                              approved: 'bg-green-500/10 text-green-400',
                              completed: 'bg-blue-500/10 text-blue-400',
                              rejected: 'bg-red-500/10 text-red-400',
                            };

                            return (
                              <tr key={idx} className="hover:bg-white/[0.01]">
                                <td className="py-3.5 px-4 font-bold text-white">
                                  {b.date} à {b.time}
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-white/80">
                                  {service?.name || '—'}
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-white/80">
                                  {barber?.name || '—'}
                                </td>
                                <td className="py-3.5 px-4 text-right font-black text-[#D4AF37]">
                                  €{(Number(b.pricePaid || 0) + Number(b.tip || 0)).toFixed(2)}
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold ${statusColors[b.status] || 'bg-white/10 text-white/40'}`}>
                                    {statusLabels[b.status] || b.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
