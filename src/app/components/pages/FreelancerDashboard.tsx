import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Loader2, LogOut, Scissors } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '../../lib/firebase';
import {
  createPortfolioItem,
  deletePortfolioItem,
  emptyFreelancerProfile,
  listPortfolioItems,
  loadFreelancerProfile,
  saveFreelancerProfile,
  type FreelancerProfileInput,
  type PortfolioItem,
} from '../../lib/marketplace/freelancer';
import {
  getBookingAddress,
  respondToBooking,
  type HomeAddress,
  type MarketplaceBooking,
} from '../../lib/marketplace/bookings';
import { parseMarketplaceBooking } from '../../lib/marketplace/bookingRecords';
import {
  confirmedAddressBookingIds,
  freelancerOwnerScope,
  jobBoardLoadKey,
} from '../../lib/marketplace/freelancerWorkspace';
import ProfileSettings from '../freelancer/ProfileSettings';
import ServiceCatalog from '../freelancer/ServiceCatalog';
import PortfolioManager from '../freelancer/PortfolioManager';
import TravelSettings from '../freelancer/TravelSettings';
import JobBoard from '../jobs/JobBoard';
import ReferralCard from '../referrals/ReferralCard';
import { useAuth } from '../context/AuthContext';

function bookingRecord(id: string, value: Record<string, unknown>): MarketplaceBooking | null {
  const booking = parseMarketplaceBooking(id, null, value);
  return booking?.ownerType === 'freelancer' ? booking : null;
}

export default function FreelancerDashboard() {
  const { user, logout } = useAuth();
  const [draft, setDraft] = useState<FreelancerProfileInput>(() => emptyFreelancerProfile(user?.displayName));
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [bookings, setBookings] = useState<MarketplaceBooking[]>([]);
  const [bookingAddresses, setBookingAddresses] = useState<Record<string, HomeAddress>>({});
  const [profileRevision, setProfileRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadPortfolio = useCallback(async () => { if (user) setPortfolio(await listPortfolioItems(user.uid)); }, [user?.uid]);
  useEffect(() => { if (!user) return; let active = true; setLoading(true); void Promise.all([loadFreelancerProfile(user.uid), listPortfolioItems(user.uid)]).then(([profile, items]) => { if (!active) return; if (profile) { const { uid: _uid, ...input } = profile; setDraft(input); } setPortfolio(items); }).catch(() => toast.error('Impossible de charger votre espace indépendant.')).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [user?.uid]);
  useEffect(() => {
    if (!user) return;
    const [ownerId, ownerType] = freelancerOwnerScope(user.uid);
    return onSnapshot(
      query(
        collection(db, 'bookingRequests'),
        where(...ownerId),
        where(...ownerType),
      ),
      snapshot => setBookings(snapshot.docs
        .map(item => bookingRecord(item.id, item.data()))
        .filter((item): item is MarketplaceBooking => item !== null)
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))),
      () => toast.error('Impossible de charger les demandes à domicile.'),
    );
  }, [user?.uid]);
  useEffect(() => {
    let active = true;
    const missingAddressIds = confirmedAddressBookingIds(
      bookings,
      new Set(Object.keys(bookingAddresses)),
    );
    void Promise.all(missingAddressIds.map(async bookingId => {
      const address = await getBookingAddress(bookingId);
      if (active) setBookingAddresses(current => ({ ...current, [bookingId]: address }));
    })).catch(() => {
      if (active) toast.error('Impossible de charger une adresse confirmée.');
    });
    return () => { active = false; };
  }, [bookings, bookingAddresses]);
  if (!user || loading) return <div className="grid min-h-screen place-items-center bg-black text-white"><Loader2 className="h-7 w-7 animate-spin text-[#D4AF37]" /></div>;
  const save = async () => { setSaving(true); try { await saveFreelancerProfile(draft); setProfileRevision(current => current + 1); toast.success('Profil indépendant enregistré.'); } catch { toast.error('Impossible d’enregistrer le profil. Vérifiez les champs.'); } finally { setSaving(false); } };
  const answer = async (bookingId: string, decision: 'accept' | 'decline') => {
    try {
      const result = await respondToBooking({ bookingId, decision });
      if (result.status === 'confirmed') {
        try {
          const address = await getBookingAddress(bookingId);
          setBookingAddresses(current => ({ ...current, [bookingId]: address }));
        } catch {
          toast.error('Visite acceptée, mais l’adresse confirmée doit être rechargée.');
        }
      }
      setBookings(current => current.map(item => (
        item.id === bookingId ? { ...item, status: result.status } : item
      )));
      toast.success(decision === 'accept' ? 'Visite acceptée.' : 'Visite refusée.');
    } catch {
      toast.error('La demande a changé ou vous n’êtes plus autorisé à agir.');
    }
  };
  return (
    <div className="min-h-screen bg-[#070707] text-white">
      <header className="border-b border-white/10 bg-black/80"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#D4AF37] text-black"><Scissors className="h-5 w-5" /></span><div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[#D4AF37]">Barberboard Freelancer</p><h1 className="font-black">{draft.displayName || 'Espace indépendant'}</h1></div></div><button type="button" onClick={() => void logout()} className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-white/60"><LogOut className="h-4 w-4" /> Quitter</button></div></header>
      <main className="mx-auto max-w-7xl space-y-6 px-5 py-7">
        <section className="rounded-3xl border border-[#D4AF37]/20 bg-gradient-to-r from-[#17130a] to-[#111] p-6"><p className="text-xs font-black uppercase tracking-[.2em] text-[#D4AF37]">Votre activité, vos choix</p><h2 className="mt-2 text-3xl font-black">Pilotez votre profil, vos services et vos visites.</h2><p className="mt-2 max-w-xl text-sm text-white/55">Votre portfolio et vos tarifs restent sous votre contrôle. Publiez seulement lorsque votre profil est prêt.</p><button disabled={saving} type="button" onClick={() => void save()} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Enregistrer les modifications</button></section>
        <ReferralCard surface="freelancer" title="Développez votre clientèle" description="Partagez votre lien Barberboard et suivez les crédits liés à vos parrainages." />
        <ProfileSettings value={draft} onChange={setDraft} />
        <ServiceCatalog value={draft} onChange={setDraft} />
        <TravelSettings value={draft} onChange={setDraft} />
        <section className="rounded-3xl border border-white/10 bg-[#111] p-6"><h2 className="text-xl font-black">Demandes à domicile</h2><p className="mt-1 text-sm text-white/45">Avant acceptation, seule la zone approximative est visible. L’adresse exacte reste privée.</p><div className="mt-5 space-y-3">{bookings.map(booking => <article key={booking.id} className="rounded-2xl border border-white/10 bg-black p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-[#D4AF37]">{booking.status === 'pending_approval' ? 'En attente de votre décision' : booking.status}</p><h3 className="mt-2 font-bold">{booking.serviceId} · {booking.date} à {booking.time}</h3><p className="mt-1 text-sm text-white/45">Zone approximative : {booking.approximateArea || 'non précisée'}</p>{typeof booking.totalPriceMinor === 'number' && <p className="mt-1 text-sm text-white/60">Service : {((booking.servicePriceMinor ?? 0) / 100).toFixed(2)} € · Déplacement : {((booking.travelFeeMinor ?? 0) / 100).toFixed(2)} € · Total : {(booking.totalPriceMinor / 100).toFixed(2)} €</p>}{typeof booking.serviceRadiusKm === 'number' && <p className="mt-1 text-xs text-white/45">Distance estimée : {booking.distanceKm ?? '?'} km / rayon {booking.serviceRadiusKm} km · annulation {booking.cancellationWindowHours ?? 0} h avant</p>}{booking.status === 'confirmed' && bookingAddresses[booking.id] && <p className="mt-2 text-sm font-semibold text-white">Adresse confirmée : {bookingAddresses[booking.id].line1}, {bookingAddresses[booking.id].postalCode ? `${bookingAddresses[booking.id].postalCode} ` : ''}{bookingAddresses[booking.id].city}</p>}</div>{booking.status === 'pending_approval' && <div className="flex gap-2"><button type="button" onClick={() => void answer(booking.id, 'decline')} className="rounded-xl border border-red-400/30 px-3 py-2 text-sm text-red-200">Refuser</button><button type="button" onClick={() => void answer(booking.id, 'accept')} className="rounded-xl bg-[#D4AF37] px-3 py-2 text-sm font-black text-black">Accepter</button></div>}</div></article>)}{bookings.length === 0 && <p className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-white/40">Aucune demande pour le moment.</p>}</div></section>
        <PortfolioManager items={portfolio} onCreate={async input => { await createPortfolioItem(input); await loadPortfolio(); toast.success('Réalisation ajoutée pour modération.'); }} onDelete={async id => { await deletePortfolioItem(id); await loadPortfolio(); toast.success('Réalisation supprimée.'); }} />
        <JobBoard key={jobBoardLoadKey(draft.cityId, profileRevision)} cityId={draft.cityId} portfolioItems={portfolio} reloadToken={profileRevision} />
      </main>
    </div>
  );
}
