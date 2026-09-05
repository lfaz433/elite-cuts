import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  listSalonBookingWorkspace,
  respondToBooking,
  saveSalonAvailability,
  type MarketplaceBooking,
} from '../../lib/marketplace/bookings';
import { SalonBookingManagerView } from './SalonManagerViews';

export default function SalonBookingManager({ locationId }: { locationId: string }) {
  const [slotsText, setSlotsText] = useState('');
  const [bookings, setBookings] = useState<MarketplaceBooking[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setError(null);
      const workspace = await listSalonBookingWorkspace(locationId);
      setSlotsText(workspace.availableSlots.join('\n'));
      setBookings(workspace.bookings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de charger les réservations marketplace.');
    }
  }, [locationId]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    setSaving(true);
    try {
      const slots = [...new Set(slotsText.split(/[\n,]/).map(slot => slot.trim()).filter(Boolean))].sort();
      const saved = await saveSalonAvailability(locationId, slots);
      setSlotsText(saved.join('\n'));
      toast.success('Disponibilités enregistrées.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Impossible d’enregistrer les disponibilités.');
    } finally { setSaving(false); }
  };
  const respond = async (bookingId: string, decision: 'accept' | 'decline') => {
    try {
      const result = await respondToBooking({ bookingId, decision });
      setBookings(current => current.map(booking => booking.id === bookingId
        ? { ...booking, status: result.status }
        : booking));
      toast.success(decision === 'accept' ? 'Réservation acceptée.' : 'Réservation refusée.');
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : 'Impossible de répondre à cette demande.');
      await load();
    }
  };
  return <div>{error && <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-red-200">{error}</p>}<SalonBookingManagerView slotsText={slotsText} onSlotsTextChange={setSlotsText} onSave={save} onRespond={respond} saving={saving} bookings={bookings} /></div>;
}
