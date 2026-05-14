import { useState } from 'react';
import { X, Calendar, Clock, User, Phone, Mail, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useBusiness } from '../context/BusinessContext';
import { toast } from 'sonner';

export default function BookingModal({ onClose }: { onClose: () => void }) {
  const { services, barbers, bookings, addBooking, getAvailableTimeSlots, getAvailableBarbers } = useBusiness();
  const [step, setStep] = useState(1);
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [selectedBarberId, setSelectedBarberId] = useState('any');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedTime, setSelectedTime] = useState('');
  
  const [clientInfo, setClientInfo] = useState({
    name: '',
    email: '',
    phone: ''
  });

  const [isSuccess, setIsSuccess] = useState(false);

  const availableTimeSlots = getAvailableTimeSlots(selectedDate, selectedBarberId, selectedServiceId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    let finalBarberId = selectedBarberId;
    
    // Balanced Assignment Algorithm for 'any'
    if (selectedBarberId === 'any') {
      const candidates = getAvailableBarbers(selectedDate, selectedTime);
      if (candidates.length === 0) {
        toast.error('Plus de coiffeur disponible à cette heure précise.');
        return;
      }
      
      // Pick the one with the fewest bookings for that day
      finalBarberId = candidates.reduce((prev, curr) => {
        const prevCount = bookings.filter(b => b.barberId === prev.id && b.date === selectedDate).length;
        const currCount = bookings.filter(b => b.barberId === curr.id && b.date === selectedDate).length;
        return prevCount <= currCount ? prev : curr;
      }).id;
    }
    
    addBooking({
      clientName: clientInfo.name,
      clientEmail: clientInfo.email,
      clientPhone: clientInfo.phone,
      serviceId: selectedServiceId,
      barberId: finalBarberId,
      date: selectedDate,
      time: selectedTime,
    });

    setIsSuccess(true);
    toast.success('Demande de réservation envoyée avec succès !');
    setTimeout(() => {
      onClose();
    }, 3000);
  };

  if (isSuccess) {
    return (
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative w-full md:max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-8 text-center pb-12 md:pb-8"
        >
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
          </div>
          <h2 className="text-3xl font-bold mb-4 text-white">Réservation Reçue !</h2>
          <p className="text-white/60 mb-8">
            Merci, {clientInfo.name}. Votre réservation pour {selectedService} le {selectedDate} à {selectedTime} a bien été reçue et est en attente d'approbation.
          </p>
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg font-bold"
          >
            Fermer
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="relative w-full md:max-w-2xl bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-6 md:p-8 max-h-[90vh] overflow-y-auto pb-12 md:pb-8"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
            Prendre Rendez-vous
          </h2>
          <p className="text-white/60 mb-8">
            {step === 1 && 'Sélectionnez votre service'}
            {step === 2 && 'Choisissez votre coiffeur'}
            {step === 3 && 'Choisissez une date et une heure'}
            {step === 4 && 'Vos coordonnées'}
          </p>

          <div className="flex items-center gap-2 mb-8">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                    step >= s ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black' : 'bg-white/10 text-white/40'
                  }`}
                >
                  {s}
                </div>
                {s < 4 && <div className={`flex-1 h-0.5 ${step > s ? 'bg-[#D4AF37]' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {step === 1 && (
              <div className="space-y-4">
                <label className="block text-white font-medium">Sélectionnez un Service</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setSelectedServiceId(service.id)}
                      className={`p-4 rounded-lg text-left transition-all ${
                        selectedServiceId === service.id
                          ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black border-transparent scale-[1.02]'
                          : 'bg-white/5 text-white border border-[#D4AF37]/20 hover:bg-white/10'
                      }`}
                    >
                      <div className="font-bold">{service.name}</div>
                      <div className="text-sm opacity-70">{service.duration} • {service.price}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <label className="block text-white font-medium">Sélectionnez un Coiffeur</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedBarberId('any')}
                    className={`p-4 rounded-lg flex items-center gap-4 transition-all ${
                      selectedBarberId === 'any'
                        ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black scale-[1.02]'
                        : 'bg-white/5 text-white border border-[#D4AF37]/20 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full flex items-center justify-center border border-[#D4AF37]/30 bg-[#141414]">
                      <User className="w-6 h-6 text-[#D4AF37]" />
                    </div>
                    <div className="text-left">
                      <div className="font-bold">N'importe quel coiffeur</div>
                      <div className="text-sm opacity-70">Le premier disponible</div>
                    </div>
                  </button>
                  {barbers.map((barber) => (
                    <button
                      key={barber.id}
                      type="button"
                      onClick={() => setSelectedBarberId(barber.id)}
                      className={`p-4 rounded-lg flex items-center gap-4 transition-all ${
                        selectedBarberId === barber.id
                          ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black scale-[1.02]'
                          : 'bg-white/5 text-white border border-[#D4AF37]/20 hover:bg-white/10'
                      }`}
                    >
                      <img src={barber.image} alt={barber.name} className="w-12 h-12 rounded-full object-cover border border-[#D4AF37]/30" />
                      <div>
                        <div className="font-bold">{barber.name}</div>
                        <div className="text-sm opacity-70">{barber.specialty}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <label className="block text-white mb-2 font-medium">Sélectionnez la Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#D4AF37]" />
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white mb-3 font-medium">Sélectionnez l'Heure</label>
                  <div className="grid grid-cols-4 gap-2">
                    {availableTimeSlots.map((time) => (
                      <button
                        key={time}
                        type="button"
                        onClick={() => setSelectedTime(time)}
                        className={`p-3 rounded-lg text-center transition-all ${
                          selectedTime === time
                            ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-bold'
                            : 'bg-white/5 text-white border border-[#D4AF37]/20 hover:bg-white/10'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-white font-medium">Nom Complet</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#D4AF37]" />
                    <input
                      type="text"
                      placeholder="Entrez votre nom"
                      value={clientInfo.name}
                      onChange={(e) => setClientInfo({ ...clientInfo, name: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-white font-medium">Adresse Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#D4AF37]" />
                    <input
                      type="email"
                      placeholder="Entrez votre email"
                      value={clientInfo.email}
                      onChange={(e) => setClientInfo({ ...clientInfo, email: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-white font-medium">Numéro de Téléphone</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#D4AF37]" />
                    <input
                      type="tel"
                      placeholder="Entrez votre numéro de téléphone"
                      value={clientInfo.phone}
                      onChange={(e) => setClientInfo({ ...clientInfo, phone: e.target.value })}
                      className="w-full pl-12 pr-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white focus:border-[#D4AF37] focus:outline-none transition-colors"
                      required
                    />
                  </div>
                </div>

                <div className="mt-6 p-6 bg-white/5 rounded-lg border border-[#D4AF37]/20">
                  <h3 className="text-white font-bold mb-3">Résumé de la Réservation</h3>
                  <div className="space-y-2 text-white/60 text-sm">
                    <p><span className="text-[#D4AF37]">Service:</span> {selectedService}</p>
                    <p><span className="text-[#D4AF37]">Coiffeur:</span> {selectedBarber}</p>
                    <p><span className="text-[#D4AF37]">Date:</span> {selectedDate}</p>
                    <p><span className="text-[#D4AF37]">Heure:</span> {selectedTime}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4 pt-4">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="flex-1 px-6 py-3 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all font-bold"
                >
                  Retour
                </button>
              )}
              {step < 4 ? (
                <button
                  type="button"
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (step === 1 && !selectedService) ||
                    (step === 2 && !selectedBarber) ||
                    (step === 3 && (!selectedDate || !selectedTime))
                  }
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                >
                  Suivant
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!clientInfo.name || !clientInfo.email || !clientInfo.phone}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold"
                >
                  Confirmer la Réservation
                </button>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
