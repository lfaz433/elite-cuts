import { useState } from 'react';
import { toast } from 'sonner';
import FreelancerPreviewShell from '../freelancer/preview/FreelancerPreviewShell';
import { AnalyticsPanel, BookingsPanel, PlannerPanel, ServicesPanel, SettingsPanel, ShowcasePanel, TodayPanel } from '../freelancer/preview/PreviewPanels';
import { addPreviewAvailability, addPreviewService, blockPreviewSlot, createPreviewState, markPreviewNotificationsRead, removePreviewSlot, respondToPreviewBooking, setPreviewView, togglePreviewService, type PreviewAvailabilityInput, type PreviewSlot } from '../freelancer/preview/freelancerPreviewModel';

export default function FreelancerPreviewPage() {
  const [state, setState] = useState(createPreviewState);
  const [selectedDay, setSelectedDay] = useState('2026-11-10');

  const navigate = (view: typeof state.activeView) => setState(current => setPreviewView(current, view));
  const applyMutation = (mutation: ReturnType<typeof addPreviewAvailability>, successMessage: string) => {
    if (mutation.error) {
      toast.error(mutation.error);
      return;
    }
    setState(mutation.state);
    toast.success(successMessage);
  };
  const addAvailability = (input: PreviewAvailabilityInput) => applyMutation(addPreviewAvailability(state, input), 'Créneau disponible ajouté à votre démo.');
  const blockSlot = (input: Pick<PreviewSlot, 'day' | 'start' | 'end'>) => applyMutation(blockPreviewSlot(state, input), 'Plage bloquée dans votre démo.');
  const respondBooking = (bookingId: string, response: 'confirmed' | 'declined') => {
    setState(current => respondToPreviewBooking(current, bookingId, response));
    toast.success(response === 'confirmed' ? 'Réservation confirmée dans la démo.' : 'Réservation refusée dans la démo.');
  };
  const addService = (input: Parameters<typeof addPreviewService>[1]) => {
    const mutation = addPreviewService(state, input);
    if (mutation.error) { toast.error(mutation.error); return; }
    setState(mutation.state);
    toast.success('Service ajouté à votre démo.');
  };

  let content;
  switch (state.activeView) {
    case 'planning': content = <PlannerPanel state={state} selectedDay={selectedDay} onSelectedDayChange={setSelectedDay} onAddAvailability={addAvailability} onBlock={blockSlot} onRemoveSlot={slotId => { setState(current => removePreviewSlot(current, slotId)); toast.success('Créneau supprimé de la démo.'); }} />; break;
    case 'bookings': content = <BookingsPanel state={state} onBookingResponse={respondBooking} />; break;
    case 'services': content = <ServicesPanel state={state} onAddService={addService} onToggleService={serviceId => setState(current => togglePreviewService(current, serviceId))} />; break;
    case 'showcase': content = <ShowcasePanel state={state} />; break;
    case 'analytics': content = <AnalyticsPanel state={state} />; break;
    case 'settings': content = <SettingsPanel />; break;
    default: content = <TodayPanel state={state} onNavigate={navigate} onBookingResponse={respondBooking} />;
  }

  return <FreelancerPreviewShell activeView={state.activeView} notifications={state.notifications} onNavigate={navigate} onMarkAllNotificationsRead={() => { setState(current => markPreviewNotificationsRead(current)); toast.success('Notifications marquées comme lues dans la démo.'); }}>{content}</FreelancerPreviewShell>;
}
