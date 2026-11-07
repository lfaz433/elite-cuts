import { useId, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';
import type { MarketplaceBooking } from '../../lib/marketplace/bookings';

const submitReview = httpsCallable<{ bookingId: string; rating: number; text?: string }, unknown>(
  functions, 'submitFreelancerReview',
);

export function canReviewBooking(booking: MarketplaceBooking, callerUid?: string): boolean {
  return !!callerUid && booking.clientId === callerUid && booking.source === 'marketplace'
    && booking.ownerType === 'freelancer' && booking.status === 'completed';
}

export function BookingReviewForm({ booking, callerUid }: { booking: MarketplaceBooking; callerUid?: string }) {
  const id = useId();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  if (!canReviewBooking(booking, callerUid)) return null;
  if (submitted) return <p role="status" className="mt-3 rounded-xl bg-[#D4AF37]/10 p-4 text-sm text-[#D4AF37]">Merci, votre avis a été enregistré. Un seul avis est possible par rendez-vous.</p>;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !canReviewBooking(booking, callerUid) || !Number.isInteger(rating) || rating < 1 || rating > 5 || text.length > 500) return;
    inFlight.current = true;
    setSubmitting(true); setError(null);
    try {
      const result = await submitReview({ bookingId: booking.id, rating, ...(text.trim() ? { text: text.trim() } : {}) });
      const data = result.data as Record<string, unknown> | null;
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length !== 2
        || data.reviewId !== booking.id || data.status !== 'approved') throw new Error('Invalid review response');
      setSubmitted(true);
    } catch (failure) {
      if ((failure as { code?: string })?.code === 'functions/already-exists') setSubmitted(true);
      else setError('Votre avis n’a pas pu être envoyé. Vous pouvez réessayer.');
    } finally {
      inFlight.current = false; setSubmitting(false);
    }
  };

  return <form onSubmit={handleSubmit} className="mt-3 rounded-xl border border-white/10 bg-white/5 p-4">
    <fieldset disabled={submitting}>
      <legend className="font-semibold">Votre avis sur ce rendez-vous</legend>
      <p id={`${id}-notice`} className="mt-1 text-sm text-white/60">Votre prénom et l’initiale de votre nom seront publics. L’avis ne pourra pas être modifié après l’envoi.</p>
      <div className="my-3 flex flex-wrap gap-3">{[1, 2, 3, 4, 5].map(stars => <label key={stars} className="flex items-center gap-1 text-sm">
        <input type="radio" name={`${id}-rating`} value={stars} checked={rating === stars} required
          onChange={event => setRating(Number(event.target.value))} className="accent-[#D4AF37]" />
        {stars} {stars === 1 ? 'étoile' : 'étoiles'}
      </label>)}</div>
      <label htmlFor={`${id}-text`} className="text-sm text-white/80">Commentaire (facultatif)</label>
      <textarea id={`${id}-text`} value={text} maxLength={500} rows={3} aria-describedby={`${id}-notice`}
        onChange={event => setText(event.target.value)} className="mt-2 w-full rounded-lg border border-white/20 bg-black/30 p-3 text-sm"
        placeholder="Partagez votre expérience, sans coordonnées personnelles." />
      <p className="mt-1 text-right text-xs text-white/50">{text.length}/500</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-200">{error}</p>}
      <button type="submit" disabled={submitting || rating === 0} className="mt-3 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-black disabled:opacity-50">
        {submitting ? 'Envoi…' : 'Publier mon avis'}
      </button>
    </fieldset>
  </form>;
}
