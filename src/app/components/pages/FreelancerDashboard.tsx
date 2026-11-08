import { useEffect, useRef, useState } from 'react';
import { Navigate, Link, useLocation } from 'react-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { db, functions } from '../../lib/firebase';
import {
  createPortfolioItem, deletePortfolioItem, emptyFreelancerProfile, listPortfolioItems,
  loadFreelancerProfile, saveFreelancerProfile, type FreelancerProfileInput, type PortfolioItem,
} from '../../lib/marketplace/freelancer';
import { completeFreelancerBooking, getBookingAddress, respondToBooking, type HomeAddress, type MarketplaceBooking } from '../../lib/marketplace/bookings';
import { parseMarketplaceBooking } from '../../lib/marketplace/bookingRecords';
import { freelancerOwnerScope, confirmedAddressBookingIds, jobBoardLoadKey } from '../../lib/marketplace/freelancerWorkspace';
import { normalizePublicSlug } from '../../lib/marketplace/identity';
import { useAuth } from '../context/AuthContext';
import ServiceCatalog from '../freelancer/ServiceCatalog';
import JobBoard from '../jobs/JobBoard';
import FreelancerShell from '../freelancer/workspace/FreelancerShell';
import FreelancerOverviewView from '../freelancer/workspace/FreelancerOverviewView';
import FreelancerCalendarView from '../freelancer/workspace/FreelancerCalendarView';
import FreelancerBookingsView from '../freelancer/workspace/FreelancerBookingsView';
import FreelancerMarketingView from '../freelancer/workspace/FreelancerMarketingView';
import FreelancerAnalyticsView from '../freelancer/workspace/FreelancerAnalyticsView';
import FreelancerSettingsView from '../freelancer/workspace/FreelancerSettingsView';
import { freelancerWorkspaceRedirect, resolveFreelancerWorkspaceView, type FreelancerWorkspaceView } from '../freelancer/workspace/freelancerWorkspaceRoutes';
import { publicFreelancerUrl, validateProfileIdentity, normalizeAvailabilitySlots, slugError, type IdentityErrors, type FreelancerInboxReview } from '../freelancer/workspace/freelancerWorkspacePresentation';
import { ViewHeading, secondaryButton } from '../freelancer/workspace/WorkspaceUI';

const listReviewsCall = httpsCallable<Record<string, never>, FreelancerInboxReview[]>(functions, 'listMyFreelancerReviews');

export default function FreelancerDashboard() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const redirect = freelancerWorkspaceRedirect(pathname);
  if (redirect) return <Navigate to={redirect} replace />;
  if (!user) return <Navigate to="/" replace />;
  return <FreelancerWorkspaceData key={user.uid} uid={user.uid} displayName={user.displayName ?? ''} onLogout={() => void logout()} view={resolveFreelancerWorkspaceView(pathname)} />;
}

// Profile, bookings, private addresses, portfolio and review inbox share one owner-scoped loader.
// The UID key above clears every cache when the signed-in owner changes.
function FreelancerWorkspaceData({ uid, displayName, view, onLogout }: {
  uid: string; displayName: string; view: FreelancerWorkspaceView; onLogout: () => void;
}) {
  const [draft, setDraft] = useState<FreelancerProfileInput>(() => emptyFreelancerProfile(displayName));
  const [savedProfile, setSavedProfile] = useState<FreelancerProfileInput | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);
  const [bookings, setBookings] = useState<MarketplaceBooking[]>([]);
  const [bookingAddresses, setBookingAddresses] = useState<Record<string, HomeAddress>>({});
  const [reviews, setReviews] = useState<FreelancerInboxReview[]>([]);
  const [profileRevision, setProfileRevision] = useState(0);
  const [loadRevision, setLoadRevision] = useState(0);
  const [bookingRevision, setBookingRevision] = useState(0);
  const [reviewRevision, setReviewRevision] = useState(0);
  const [addressRevision, setAddressRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState(false);
  const [addressError, setAddressError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [identityErrors, setIdentityErrors] = useState<IdentityErrors>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answerError, setAnswerError] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const savingLock = useRef(false);
  const answerLock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const interval = window.setInterval(() => setNow(new Date()), 60000); return () => window.clearInterval(interval); }, []);

  useEffect(() => {
    let active = true; setLoading(true); setLoadError(false);
    void Promise.all([loadFreelancerProfile(uid), listPortfolioItems(uid)]).then(([profile, items]) => {
      if (!active) return;
      const input = profile ? (({ uid: _uid, ...rest }) => rest)(profile) : emptyFreelancerProfile(displayName);
      setDraft(input); setSavedProfile(profile ? input : null); setPortfolio(items);
    }).catch(() => { if (active) setLoadError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [uid, loadRevision]);

  useEffect(() => {
    setBookingsLoading(true); setBookingsError(false);
    const [ownerId, ownerType] = freelancerOwnerScope(uid);
    return onSnapshot(query(collection(db, 'bookingRequests'), where(...ownerId), where(...ownerType)), snapshot => {
      setBookings(snapshot.docs.map(item => parseMarketplaceBooking(item.id, null, item.data()))
        .filter((item): item is MarketplaceBooking => item !== null && item.ownerId === uid && item.ownerType === 'freelancer')
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)));
      setBookingsLoading(false); setBookingsError(false);
    }, () => { setBookingsError(true); setBookingsLoading(false); });
  }, [uid, bookingRevision]);

  useEffect(() => {
    let active = true;
    // A chair appointment always uses its commercial workplace snapshot, never the private address callable.
    const homeBookings = bookings.filter(booking => booking.appointmentMode === 'home');
    const ids = confirmedAddressBookingIds(homeBookings, new Set(Object.keys(bookingAddresses)));
    if (!ids.length) { setAddressError(false); return; }
    void Promise.allSettled(ids.map(async id => ({ id, address: await getBookingAddress(id) }))).then(results => {
      if (!active) return;
      setBookingAddresses(current => ({ ...current, ...Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [[result.value.id, result.value.address]] : [])) }));
      setAddressError(results.some(result => result.status === 'rejected'));
    });
    return () => { active = false; };
  }, [bookings, addressRevision]);

  useEffect(() => {
    if (!savedProfile) { setReviews([]); return; }
    let active = true; setReviewsLoading(true); setReviewsError(false);
    void listReviewsCall({}).then(result => { if (active) setReviews(result.data); })
      .catch(() => { if (active) setReviewsError(true); })
      .finally(() => { if (active) setReviewsLoading(false); });
    return () => { active = false; };
  }, [uid, Boolean(savedProfile), reviewRevision]);

  const changeDraft = (next: FreelancerProfileInput) => {
    setDraft(next);
    // Keep a server slug collision until the user edits that particular field.
    setIdentityErrors(current => ({ ...validateProfileIdentity(next), ...(current.publicSlug?.includes('déjà utilisé') && next.identity.publicSlug === draft.identity.publicSlug ? { publicSlug: current.publicSlug } : {}) }));
    setSaveError(null);
  };
  const save = async () => {
    if (savingLock.current) return;
    const errors = validateProfileIdentity(draft);
    setIdentityErrors(errors);
    if (Object.keys(errors).length) {
      setSaveError('Vérifiez les champs de votre identité publique.');
      const field = Object.keys(errors)[0]; document.getElementById('freelancer-' + field)?.focus(); return;
    }
    const availabilityByMode = {
      home: normalizeAvailabilitySlots(draft.availabilityByMode.home.join('\n')),
      chair: normalizeAvailabilitySlots(draft.availabilityByMode.chair.join('\n')),
    };
    const input = {
      ...draft,
      identity: { ...draft.identity, publicSlug: draft.identity.publicSlug.trim() ? normalizePublicSlug(draft.identity.publicSlug) : '' },
      availabilityByMode,
      availability: availabilityByMode.home,
    };
    // An unfinished optional workplace must not prevent saving a home-only draft.
    if (!input.workModes.chair && input.workplace && Object.values(input.workplace).some(value => !value.trim())) delete input.workplace;
    savingLock.current = true; setSaving(true); setSaveError(null);
    try {
      await saveFreelancerProfile(input);
      if (!mounted.current) return;
      setDraft(input); setSavedProfile(input); setProfileRevision(value => value + 1);
      toast.success('Votre profil et vos services ont été enregistrés.');
    } catch (error) {
      if (!mounted.current) return;
      const failure = error as { code?: string; message?: string };
      if (failure.code === 'functions/already-exists') setIdentityErrors({ publicSlug: 'Cet identifiant public est déjà utilisé. Choisissez-en un autre.' });
      else if (failure.message?.includes('publicSlug')) setIdentityErrors({ publicSlug: slugError });
      setSaveError(failure.code === 'functions/already-exists' ? 'Le lien public doit être unique.' : 'Impossible d’enregistrer. Vérifiez les services, créneaux et informations obligatoires.');
    } finally { savingLock.current = false; if (mounted.current) setSaving(false); }
  };
  const answer = async (id: string, decision: 'accept' | 'decline') => {
    if (answerLock.current) return;
    answerLock.current = true; setBusyId(id); setAnswerError(false);
    try {
      const result = await respondToBooking({ bookingId: id, decision });
      if (!mounted.current) return;
      setBookings(current => current.map(item => item.id === id ? { ...item, status: result.status } : item));
      toast.success(decision === 'accept' ? 'Rendez-vous accepté.' : 'Demande refusée.');
    } catch { if (mounted.current) setAnswerError(true); }
    finally { answerLock.current = false; if (mounted.current) setBusyId(null); }
  };
  const refreshPortfolio = async () => { const items = await listPortfolioItems(uid); if (mounted.current) setPortfolio(items); };
  const complete = async (id: string) => {
    if (answerLock.current) return;
    answerLock.current = true; setBusyId(id); setAnswerError(false);
    try {
      await completeFreelancerBooking(id);
      if (!mounted.current) return;
      setBookings(current => current.map(item => item.id === id ? { ...item, status: 'completed' } : item));
      toast.success('Rendez-vous terminé. Le client peut maintenant laisser un avis.');
    } catch { if (mounted.current) setAnswerError(true); }
    finally { answerLock.current = false; if (mounted.current) setBusyId(null); }
  };
  const dirty = JSON.stringify(draft) !== JSON.stringify(savedProfile ?? emptyFreelancerProfile(displayName));
  // Share only the last successfully saved identity; a local publish checkbox does not publish a URL.
  const publicUrl = savedProfile ? publicFreelancerUrl(window.location.origin, savedProfile) : null;
  if (loading) return <div role="status" className="grid min-h-screen place-items-center bg-[#090b0c] text-white"><div className="flex items-center gap-3"><Loader2 className="h-6 w-6 animate-spin text-[#D4AF37]" />Chargement de votre espace…</div></div>;
  if (loadError) return <div role="alert" className="grid min-h-screen place-items-center bg-[#090b0c] p-6 text-white"><div><p>Impossible de charger votre profil. Aucun changement n’a été enregistré.</p><button type="button" className={secondaryButton + ' mt-5'} onClick={() => setLoadRevision(value => value + 1)}>Réessayer</button></div></div>;
  // Before the first successful save, operational views stay unpublished and have no configured slots.
  const operationalProfile = savedProfile ?? emptyFreelancerProfile(displayName);
  return <FreelancerShell view={view} profile={operationalProfile} publicUrl={publicUrl} onLogout={onLogout}>
    {dirty && <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D4AF37]/25 bg-[#D4AF37]/5 p-4 text-sm text-[#E4C76B]"><p>Modifications non enregistrées.</p>{view !== 'settings' && <Link to="/freelancer/settings" className="font-semibold underline underline-offset-4">Enregistrer dans Paramètres</Link>}</div>}
    {bookingsLoading && <p role="status" className="mb-5 text-sm text-white/50">Chargement des réservations…</p>}
    {bookingsError && <div role="alert" className="mb-5 rounded-xl border border-red-400/20 p-4 text-sm text-red-200">Les réservations ne sont pas à jour. <button type="button" onClick={() => setBookingRevision(value => value + 1)} className="ml-3 underline">Réessayer</button></div>}
    {addressError && <div role="alert" className="mb-5 rounded-xl border border-red-400/20 p-4 text-sm text-red-200">Une adresse confirmée n’a pas pu être chargée. <button type="button" onClick={() => setAddressRevision(value => value + 1)} className="ml-3 underline">Réessayer</button></div>}
    {answerError && <p role="alert" className="mb-5 rounded-xl border border-red-400/20 p-4 text-sm text-red-200">Impossible de traiter cette demande. Vérifiez son statut puis réessayez.</p>}
    {view === 'overview' && <FreelancerOverviewView profile={operationalProfile} bookings={bookings} addresses={bookingAddresses} now={now} />}
    {view === 'calendar' && <FreelancerCalendarView profile={operationalProfile} bookings={bookings} addresses={bookingAddresses} now={now} />}
    {view === 'bookings' && <FreelancerBookingsView bookings={bookings} addresses={bookingAddresses} busyId={busyId} onAnswer={(id, decision) => void answer(id, decision)} onComplete={id => void complete(id)} />}
    {view === 'services' && <><ViewHeading eyebrow="Votre carte" title="Services" description="Définissez vos prestations, leurs tarifs et le temps nécessaire à chaque rendez-vous." action={null} /><fieldset disabled={saving} className="min-w-0"><ServiceCatalog value={draft} onChange={changeDraft} /></fieldset></>}
    {view === 'marketing' && <FreelancerMarketingView profile={operationalProfile} publicUrl={publicUrl} portfolio={portfolio} reviews={reviews} reviewsLoading={reviewsLoading} reviewsError={reviewsError} onRetryReviews={() => setReviewRevision(value => value + 1)} onCreatePortfolio={async input => { await createPortfolioItem(input); await refreshPortfolio(); toast.success('Réalisation ajoutée pour modération.'); }} onDeletePortfolio={async id => { await deletePortfolioItem(id); await refreshPortfolio(); toast.success('Réalisation supprimée.'); }} />}
    {view === 'analytics' && <FreelancerAnalyticsView bookings={bookings} now={now} />}
    {view === 'settings' && <><FreelancerSettingsView profile={draft} onChange={changeDraft} onSave={() => void save()} saving={saving} errors={identityErrors} saveError={saveError} /><details className="mt-6 rounded-2xl border border-white/10 p-5"><summary className="cursor-pointer text-sm text-white/60">Opportunités professionnelles dans votre ville</summary><div className="mt-5 [&_button]:!border [&_button]:!border-white/15 [&_button]:!bg-transparent [&_button]:!text-white/75"><JobBoard key={jobBoardLoadKey(operationalProfile.cityId, profileRevision)} cityId={operationalProfile.cityId} portfolioItems={portfolio} reloadToken={profileRevision} /></div></details></>}
  </FreelancerShell>;
}
