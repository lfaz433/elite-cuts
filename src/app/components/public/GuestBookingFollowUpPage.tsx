import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { cancelBooking, getGuestFreelancerBooking, type GuestBookingFollowUp } from '../../lib/marketplace/bookings';
import { BookingStatusCard } from '../booking/BookingStatusCard';
import { BookingReviewForm } from '../client/BookingReviewForm';

export default function GuestBookingFollowUpPage() {
  const { bookingId = '' } = useParams();
  const [loaded, setLoaded] = useState<GuestBookingFollowUp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const refresh = () => setRevision(value => value + 1);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setLoaded(null);
    void getGuestFreelancerBooking(bookingId).then(result => { if (active) setLoaded(result); })
      .catch(() => { if (active) setError('Cette réservation est inaccessible dans cette session. Ouvrez ce lien dans le navigateur utilisé pour votre demande, sans effacer ses données.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId, revision]);
  // A URL change must never render the previous guest's booking while loading.
  const current = loaded?.booking.id === bookingId ? loaded : null;
  const cancel = async () => {
    if (inFlight.current || !current?.canCancel) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await cancelBooking(bookingId); refresh(); }
    catch { setError('L’annulation n’a pas pu être confirmée. Actualisez le statut et vérifiez le délai d’annulation.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <main className="mx-auto min-h-[70vh] max-w-2xl px-5 py-12 text-white">
    <h1 className="text-3xl font-semibold">Votre réservation</h1>
    <p className="mt-3 text-sm leading-relaxed text-white/60">Conservez ce lien et utilisez ce même navigateur pour suivre votre rendez-vous.</p>
    <a href={`/b/reservations/${encodeURIComponent(bookingId)}`} className="mt-3 inline-block text-sm text-[#D4AF37] underline">Lien de suivi de ma réservation</a>
    {loading && <p role="status" className="mt-6">Chargement du statut…</p>}
    {error && <p role="alert" className="mt-6 rounded-xl border border-amber-300/30 p-4 text-amber-100">{error}</p>}
    {!loading && current && <div className="mt-6">
      <BookingStatusCard booking={current.booking} allowCancel={false} />
      {current.canCancel && <button type="button" disabled={busy} onClick={cancel} className="mt-4 rounded-xl border border-white/20 px-4 py-3 disabled:opacity-50">Annuler ma réservation</button>}
      {current.reviewState === 'eligible' && <BookingReviewForm key={bookingId} booking={current.booking} callerUid={current.booking.clientId} onSubmitted={refresh} />}
      {current.reviewState === 'reviewed' && <p role="status" className="mt-4 text-[#D4AF37]">Votre avis a été enregistré. Merci pour votre retour.</p>}
    </div>}
    <button type="button" disabled={loading || busy} onClick={refresh} className="mt-6 rounded-xl border border-white/20 px-4 py-3 disabled:opacity-50">{!current && error ? 'Réessayer' : 'Actualiser le statut'}</button>
  </main>;
}
