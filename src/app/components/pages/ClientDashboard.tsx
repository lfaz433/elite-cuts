import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Calendar, Heart, History, LogOut, Scissors } from 'lucide-react';
import { useNavigate } from 'react-router';
import { db } from '../../lib/firebase';
import { type MarketplaceBooking } from '../../lib/marketplace/bookings';
import {
  clientBookingScope,
  parseLegacyClientBooking,
  parseMarketplaceBooking,
} from '../../lib/marketplace/bookingRecords';
import { useAuth } from '../context/AuthContext';
import NotificationCenter from '../ui/NotificationCenter';
import NotificationPermissionModal from '../modals/NotificationPermissionModal';
import { UpcomingBookings } from '../client/UpcomingBookings';
import { BookingHistory } from '../client/BookingHistory';
import { Favourites, type Favourite } from '../client/Favourites';

export default function ClientDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [marketplaceBookings, setMarketplaceBookings] = useState<MarketplaceBooking[]>([]);
  const [legacyBookings, setLegacyBookings] = useState<MarketplaceBooking[]>([]);
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'history' | 'favourites'>('upcoming');
  const [marketplaceLoading, setMarketplaceLoading] = useState(true);
  const [legacyLoading, setLegacyLoading] = useState(true);
  const [marketplaceError, setMarketplaceError] = useState<string | null>(null);
  const [legacyError, setLegacyError] = useState<string | null>(null);
  const [favouriteError, setFavouriteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setMarketplaceBookings([]);
      setLegacyBookings([]);
      setMarketplaceLoading(false);
      setLegacyLoading(false);
      return undefined;
    }
    setMarketplaceBookings([]);
    setLegacyBookings([]);
    setMarketplaceLoading(true);
    setLegacyLoading(true);
    setMarketplaceError(null);
    setLegacyError(null);
    setFavouriteError(null);
    const scope = clientBookingScope(user.uid);
    const bookingQuery = query(
      collection(db, 'bookingRequests'),
      ...scope.map(([field, operator, value]) => where(field, operator, value)),
    );
    const legacyQuery = query(
      collection(db, 'bookings'),
      ...scope.map(([field, operator, value]) => where(field, operator, value)),
    );
    const stopBookings = onSnapshot(bookingQuery, snapshot => {
      setMarketplaceBookings(snapshot.docs
        .map(document => parseMarketplaceBooking(document.id, user.uid, document.data()))
        .filter((booking): booking is MarketplaceBooking => booking !== null));
      setMarketplaceLoading(false);
    }, () => {
      setMarketplaceError('Les demandes marketplace ne peuvent pas être chargées.');
      setMarketplaceLoading(false);
    });
    const stopLegacyBookings = onSnapshot(legacyQuery, snapshot => {
      setLegacyBookings(snapshot.docs
        .map(document => parseLegacyClientBooking(document.id, user.uid, document.data()))
        .filter((booking): booking is MarketplaceBooking => booking !== null));
      setLegacyLoading(false);
    }, () => {
      setLegacyError('Les réservations historiques du salon ne peuvent pas être chargées.');
      setLegacyLoading(false);
    });
    const stopFavourites = onSnapshot(collection(db, 'clientFavourites', user.uid, 'items'), snapshot => setFavourites(snapshot.docs.map(document => ({ id: document.id, ...(document.data() as Omit<Favourite, 'id'>) }))), () => setFavouriteError('Vos favoris ne peuvent pas être chargés pour le moment.'));
    return () => { stopBookings(); stopLegacyBookings(); stopFavourites(); };
  }, [user?.uid]);

  const bookings = useMemo(
    () => [...marketplaceBookings, ...legacyBookings],
    [legacyBookings, marketplaceBookings],
  );
  const loadingBookings = marketplaceLoading || legacyLoading;
  const bookingError = [marketplaceError, legacyError].filter(Boolean).join(' ') || null;
  const upcoming = useMemo(() => bookings.filter(booking => booking.status === 'pending_approval' || booking.status === 'confirmed').sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)), [bookings]);
  const history = useMemo(() => bookings.filter(booking => !['pending_approval', 'confirmed'].includes(booking.status)).sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)), [bookings]);
  const handleLogout = async () => { await logout(); navigate('/'); };
  const cancelMarketplaceBooking = (bookingId: string) => setMarketplaceBookings(current => current.map(
    booking => booking.id === bookingId ? { ...booking, status: 'cancelled' } : booking,
  ));
  const bookingWarning = bookingError
    ? <p role="alert" className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100">{bookingError} Les résultats disponibles restent affichés.</p>
    : null;
  return <div className="min-h-screen bg-black text-white"><NotificationPermissionModal /><nav className="border-b border-[#D4AF37]/20 bg-[#0f0f0f] px-6 py-4"><div className="mx-auto flex max-w-5xl items-center justify-between"><div className="flex items-center gap-2"><Scissors className="h-6 w-6 text-[#D4AF37]" /><h1 className="text-xl font-bold">Barberboard</h1></div><div className="flex items-center gap-3"><NotificationCenter /><button onClick={() => void handleLogout()} aria-label="Déconnexion" className="text-white/60 hover:text-white"><LogOut className="h-5 w-5" /></button></div></div></nav><main className="mx-auto max-w-5xl px-4 py-8"><h2 className="text-3xl font-black">Mon espace client</h2><p className="mt-2 text-white/55">Suivez vos demandes et vos rendez-vous confirmés.</p><div className="mt-8 flex gap-2 rounded-xl bg-white/5 p-1">{[{ id: 'upcoming', label: 'À venir', icon: Calendar }, { id: 'history', label: 'Historique', icon: History }, { id: 'favourites', label: 'Favoris', icon: Heart }].map(tab => <button key={tab.id} onClick={() => setActiveTab(tab.id as typeof activeTab)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold ${activeTab === tab.id ? 'bg-[#D4AF37] text-black' : 'text-white/60 hover:text-white'}`}><tab.icon className="h-4 w-4" />{tab.label}</button>)}</div><section className="mt-6">{activeTab === 'upcoming' && <>{bookingWarning}{loadingBookings && upcoming.length === 0 ? <p className="text-white/60">Chargement des réservations…</p> : <UpcomingBookings bookings={upcoming} onCancelled={cancelMarketplaceBooking} />}</>}{activeTab === 'history' && <>{bookingWarning}{loadingBookings && history.length === 0 ? <p className="text-white/60">Chargement de l’historique…</p> : <BookingHistory bookings={history} />}</>}{activeTab === 'favourites' && (favouriteError ? <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{favouriteError}</p> : <Favourites favourites={favourites} />)}</section></main></div>;
}
