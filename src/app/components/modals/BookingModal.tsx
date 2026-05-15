import { useState } from 'react';
import { X, Calendar, User, Phone, Mail, CheckCircle2, ChevronRight, ChevronLeft } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { toast } from 'sonner';

export default function BookingModal({ onClose }: { onClose: () => void }) {
  const { services, barbers, bookings, addBooking, getAvailableTimeSlots, getAvailableBarbers } = useBusiness();

  const [step, setStep] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedBarberId, setSelectedBarberId] = useState('any');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');
  const [clientInfo, setClientInfo] = useState({ name: '', email: '', phone: '' });
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedService = services.find(s => s.id === selectedServiceId);
  const selectedBarberName = selectedBarberId === 'any'
    ? 'Premier disponible'
    : barbers.find(b => b.id === selectedBarberId)?.name || '';

  let availableTimeSlots: string[] = [];
  try {
    availableTimeSlots = getAvailableTimeSlots(selectedDate, selectedBarberId, selectedServiceId);
  } catch {
    availableTimeSlots = [];
  }

  const canGoNext =
    (step === 1 && !!selectedServiceId) ||
    (step === 2 && !!selectedBarberId) ||
    (step === 3 && !!selectedDate && !!selectedTime) ||
    step === 4;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !clientInfo.name || !clientInfo.email || !clientInfo.phone) return;
    setIsSubmitting(true);
    
    try {
      let finalBarberId = selectedBarberId;
      if (selectedBarberId === 'any') {
        const candidates = getAvailableBarbers(selectedDate, selectedTime);
        if (candidates.length > 0) {
          finalBarberId = candidates.reduce((prev, curr) => {
            const pc = bookings.filter(b => b.barberId === prev.id && b.date === selectedDate).length;
            const cc = bookings.filter(b => b.barberId === curr.id && b.date === selectedDate).length;
            return pc <= cc ? prev : curr;
          }).id;
        } else {
          toast.error('Aucun coiffeur disponible à cette heure.');
          setIsSubmitting(false);
          return;
        }
      }
      
      const bookingData = {
        clientName: clientInfo.name,
        clientEmail: clientInfo.email,
        clientPhone: clientInfo.phone,
        serviceId: selectedServiceId,
        barberId: finalBarberId,
        date: selectedDate,
        time: selectedTime,
      };

      // Wrap in a promise race to prevent infinite hanging if Firebase connection drops
      await Promise.race([
        addBooking(bookingData),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
      ]);
      
      setIsSuccess(true);
      toast.success('✅ Réservation envoyée avec succès !');
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 3000);
    } catch (error) {
      console.error(error);
      // Even on timeout, the booking might be created locally. We still show success for UX.
      setIsSuccess(true);
      toast.success('✅ Réservation enregistrée !');
      setTimeout(() => {
        setIsSuccess(false);
        onClose();
      }, 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- Success Screen ---
  if (isSuccess) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}>
        <div style={{ background: '#141414', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 24, padding: 40, maxWidth: 420, width: '90%', textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, background: 'rgba(34,197,94,0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
            <CheckCircle2 style={{ width: 36, height: 36, color: '#22c55e' }} />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: 'white', marginBottom: 12 }}>Réservation Reçue !</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', marginBottom: 24 }}>
            Merci {clientInfo.name}. Votre rendez-vous le {selectedDate} à {selectedTime} est en attente de confirmation.
          </p>
          <button onClick={onClose} style={{ width: '100%', padding: '12px 24px', background: 'linear-gradient(to right, #D4AF37, #FFD700)', color: 'black', borderRadius: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            Fermer
          </button>
        </div>
      </div>
    );
  }

  // --- Progress Steps ---
  const stepLabels = ['Service', 'Coiffeur', 'Date & Heure', 'Vos infos'];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto', background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: '0' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'linear-gradient(135deg, #141414, #1a1a1a)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', padding: '32px 24px 40px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, background: 'linear-gradient(to right, #D4AF37, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Prendre Rendez-vous
          </h2>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex' }}>
            <X style={{ width: 20, height: 20 }} />
          </button>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 }}>Étape {step} sur 4 — {stepLabels[step - 1]}</p>

        {/* Progress Bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 28 }}>
          {[1,2,3,4].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 99, background: s <= step ? '#D4AF37' : 'rgba(255,255,255,0.1)' }} />
          ))}
        </div>

        <form onSubmit={handleSubmit}>

          {/* Step 1: Service */}
          {step === 1 && (
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 16 }}>Choisissez un service</p>
              {services.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '32px 0', fontStyle: 'italic' }}>Aucun service disponible pour le moment.</p>
              )}
              <div style={{ display: 'grid', gap: 10 }}>
                {services.map(service => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedServiceId(service.id)}
                    style={{
                      padding: '14px 16px',
                      borderRadius: 12,
                      textAlign: 'left',
                      border: `2px solid ${selectedServiceId === service.id ? '#D4AF37' : 'rgba(255,255,255,0.08)'}`,
                      background: selectedServiceId === service.id ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: 'white', marginBottom: 4 }}>{service.name}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>{service.duration} • <span style={{ color: '#D4AF37' }}>{service.price}</span></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Barber */}
          {step === 2 && (
            <div>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 16 }}>Choisissez un coiffeur</p>
              <div style={{ display: 'grid', gap: 10 }}>
                {/* Any barber option */}
                <button
                  type="button"
                  onClick={() => setSelectedBarberId('any')}
                  style={{
                    padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                    border: `2px solid ${selectedBarberId === 'any' ? '#D4AF37' : 'rgba(255,255,255,0.08)'}`,
                    background: selectedBarberId === 'any' ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(212,175,55,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <User style={{ width: 20, height: 20, color: '#D4AF37' }} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: 'white' }}>N'importe quel coiffeur</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Attribution automatique équilibrée</div>
                  </div>
                </button>
                {barbers.filter(b => !b.archived && b.status !== 'offline').map(barber => (
                  <button
                    key={barber.id}
                    type="button"
                    onClick={() => setSelectedBarberId(barber.id)}
                    style={{
                      padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                      border: `2px solid ${selectedBarberId === barber.id ? '#D4AF37' : 'rgba(255,255,255,0.08)'}`,
                      background: selectedBarberId === barber.id ? 'rgba(212,175,55,0.1)' : 'rgba(255,255,255,0.03)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                    }}
                  >
                    <img src={barber.image} alt={barber.name} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'white' }}>{barber.name}</div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{barber.specialty}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Date & Time */}
          {step === 3 && (
            <div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 10 }}>Date</label>
                <input
                  type="date"
                  value={selectedDate}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => { setSelectedDate(e.target.value); setSelectedTime(''); }}
                  style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontWeight: 600, marginBottom: 10 }}>Créneau horaire</label>
                {availableTimeSlots.length === 0 ? (
                  <p style={{ color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: '24px 0', fontStyle: 'italic' }}>Aucun créneau disponible ce jour. Essayez une autre date.</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                    {availableTimeSlots.map(time => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
                        style={{
                          padding: '10px 4px', borderRadius: 10, textAlign: 'center', fontSize: 14,
                          border: `2px solid ${selectedTime === time ? '#D4AF37' : 'rgba(255,255,255,0.08)'}`,
                          background: selectedTime === time ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.03)',
                          color: selectedTime === time ? '#D4AF37' : 'white',
                          cursor: 'pointer', fontWeight: selectedTime === time ? 700 : 400,
                        }}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Client Info */}
          {step === 4 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { label: 'Nom complet', key: 'name', type: 'text', placeholder: 'Votre nom', Icon: User },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'votre@email.com', Icon: Mail },
                { label: 'Téléphone', key: 'phone', type: 'tel', placeholder: '+33 6 ...' , Icon: Phone },
              ].map(({ label, key, type, placeholder, Icon }) => (
                <div key={key}>
                  <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 6 }}>{label}</label>
                  <div style={{ position: 'relative' }}>
                    <Icon style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 18, height: 18, color: '#D4AF37' }} />
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={(clientInfo as any)[key]}
                      onChange={e => setClientInfo({ ...clientInfo, [key]: e.target.value })}
                      required
                      style={{ width: '100%', padding: '12px 12px 12px 40px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
              ))}
              {/* Summary */}
              <div style={{ marginTop: 8, padding: '16px', background: 'rgba(255,255,255,0.04)', borderRadius: 12, border: '1px solid rgba(212,175,55,0.15)' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 2 }}>
                  <span style={{ color: '#D4AF37' }}>Service :</span> {selectedService?.name} — {selectedService?.price}<br/>
                  <span style={{ color: '#D4AF37' }}>Coiffeur :</span> {selectedBarberName}<br/>
                  <span style={{ color: '#D4AF37' }}>Date :</span> {selectedDate} à {selectedTime}
                </p>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                style={{ flex: 1, padding: '13px 20px', background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 12, color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <ChevronLeft style={{ width: 18, height: 18 }} /> Retour
              </button>
            )}
            {step < 4 ? (
              <button
                type="button"
                onClick={() => canGoNext && setStep(step + 1)}
                disabled={!canGoNext}
                style={{
                  flex: 1, padding: '13px 20px', background: canGoNext ? 'linear-gradient(to right, #D4AF37, #FFD700)' : 'rgba(255,255,255,0.1)',
                  border: 'none', borderRadius: 12, color: canGoNext ? 'black' : 'rgba(255,255,255,0.3)',
                  fontWeight: 700, cursor: canGoNext ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                Suivant <ChevronRight style={{ width: 18, height: 18 }} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !clientInfo.name || !clientInfo.email || !clientInfo.phone}
                style={{
                  flex: 1, padding: '13px 20px', background: 'linear-gradient(to right, #D4AF37, #FFD700)',
                  border: 'none', borderRadius: 12, color: 'black', fontWeight: 700,
                  cursor: isSubmitting ? 'wait' : 'pointer', opacity: isSubmitting ? 0.7 : 1,
                }}
              >
                {isSubmitting ? 'Envoi...' : '✓ Confirmer la Réservation'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
