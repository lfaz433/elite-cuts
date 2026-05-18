import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Calendar, User, Phone, Mail, FileText, DollarSign, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '../context/BusinessContext';
import type { Booking } from '../context/BusinessContext';

interface ManualBookingModalProps {
  onClose: () => void;
  preSelectedBarberId?: string; // Locks the barber input for Barber Dashboard
}

export default function ManualBookingModal({ onClose, preSelectedBarberId }: ManualBookingModalProps) {
  const { services, barbers, addBooking, getAvailableTimeSlots } = useBusiness();

  const [formData, setFormData] = useState({
    clientName: '',
    clientEmail: '',
    clientPhone: '',
    serviceId: services[0]?.id || '',
    barberId: preSelectedBarberId || barbers[0]?.id || '',
    date: new Date().toISOString().split('T')[0],
    time: '',
    type: 'avec-rdv' as Booking['type'],
    paymentStatus: 'unpaid' as Booking['paymentStatus'],
    notes: '',
    paymentMethod: 'cash' as Booking['paymentMethod'],
    pricePaid: 0,
    tip: 0
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dynamically load available slots when date, service, or barber changes
  const availableSlots = getAvailableTimeSlots(formData.date, formData.barberId, formData.serviceId);

  useEffect(() => {
    // Automatically select the first available slot if current one is not in the list
    if (availableSlots.length > 0 && !availableSlots.includes(formData.time)) {
      setFormData(prev => ({ ...prev, time: availableSlots[0] }));
    }
  }, [formData.date, formData.barberId, formData.serviceId, availableSlots]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.clientName || !formData.clientPhone) {
      toast.error("Veuillez remplir le nom et le téléphone du client.");
      return;
    }

    if (formData.type === 'avec-rdv' && !formData.time) {
      toast.error("Aucun créneau horaire sélectionné ou disponible.");
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedService = services.find(s => s.id === formData.serviceId);
      const servicePrice = selectedService ? parseFloat(selectedService.price.replace(/[^0-9]/g, '')) : 25;

      const finalBooking = {
        clientName: formData.clientName,
        clientEmail: formData.clientEmail || 'manual@elitecuts.com',
        clientPhone: formData.clientPhone,
        serviceId: formData.serviceId,
        barberId: formData.barberId,
        date: formData.date,
        time: formData.type === 'sans-rdv' ? new Date().toTimeString().split(' ')[0].substring(0, 5) : formData.time,
        status: 'approved' as const, // Manually added bookings are auto-approved
        notes: formData.notes,
        type: formData.type,
        paymentStatus: formData.paymentStatus,
        paymentMethod: formData.paymentMethod,
        pricePaid: formData.paymentStatus === 'paid' ? servicePrice : 0,
        tip: formData.tip
      };

      await addBooking(finalBooking);
      toast.success("Rendez-vous ajouté avec succès !");
      onClose();
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("ConflictError")) {
        toast.error("Conflit de réservation: Ce créneau est déjà réservé.");
      } else {
        toast.error("Une erreur est survenue lors de l'ajout.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        className="relative w-full max-w-2xl bg-[#141414] rounded-3xl border border-[#D4AF37]/30 overflow-hidden max-h-[90vh] overflow-y-auto"
      >
        <div className="p-8">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-white flex items-center gap-2">
              <Calendar className="w-6 h-6 text-[#D4AF37]" /> Ajouter un Rendez-vous
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <X className="w-6 h-6 text-white/40" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Appointment Type Toggle */}
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, type: 'avec-rdv' }))}
                className={`py-3 rounded-xl border text-sm font-black transition-all ${
                  formData.type === 'avec-rdv'
                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                }`}
              >
                Avec Rendez-vous
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, type: 'sans-rdv' }))}
                className={`py-3 rounded-xl border text-sm font-black transition-all ${
                  formData.type === 'sans-rdv'
                    ? 'bg-[#D4AF37] text-black border-[#D4AF37]'
                    : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
                }`}
              >
                Sans RDV (Walk-in)
              </button>
            </div>

            {/* Client Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Nom du Client</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]" />
                  <input
                    type="text"
                    required
                    value={formData.clientName}
                    onChange={e => setFormData({ ...formData, clientName: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                    placeholder="Jean Dupont"
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Téléphone</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]" />
                  <input
                    type="text"
                    required
                    value={formData.clientPhone}
                    onChange={e => setFormData({ ...formData, clientPhone: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                    placeholder="+33 6..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Email (Optionnel)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]" />
                  <input
                    type="email"
                    value={formData.clientEmail}
                    onChange={e => setFormData({ ...formData, clientEmail: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                    placeholder="client@test.com"
                  />
                </div>
              </div>
            </div>

            {/* Service & Barber Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Prestation</label>
                <select
                  value={formData.serviceId}
                  onChange={e => setFormData({ ...formData, serviceId: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                >
                  {services.map(s => (
                    <option key={s.id} value={s.id} className="bg-[#141414]">{s.name} ({s.price})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Coiffeur Assigné</label>
                <select
                  value={formData.barberId}
                  disabled={!!preSelectedBarberId}
                  onChange={e => setFormData({ ...formData, barberId: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none disabled:opacity-50"
                >
                  {barbers.map(b => (
                    <option key={b.id} value={b.id} className="bg-[#141414]">{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Scheduling (Only for standard appointment) */}
            {formData.type === 'avec-rdv' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                <div>
                  <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Date</label>
                  <input
                    type="date"
                    min={new Date().toISOString().split('T')[0]}
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                  />
                </div>

                <div>
                  <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider flex items-center justify-between">
                    Créneau Horaire
                    {availableSlots.length > 0 && (
                      <span className="text-[10px] text-green-400 font-bold bg-green-500/10 px-2 py-0.5 rounded-full">
                        {availableSlots.length} Dispo(s)
                      </span>
                    )}
                  </label>
                  <select
                    value={formData.time}
                    onChange={e => setFormData({ ...formData, time: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                  >
                    {availableSlots.length === 0 ? (
                      <option value="" className="bg-[#141414] text-white/30">Aucun créneau disponible</option>
                    ) : (
                      availableSlots.map(t => (
                        <option key={t} value={t} className="bg-[#141414]">{t}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            )}

            {/* Financial Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-white/5 pt-4">
              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Statut Paiement</label>
                <select
                  value={formData.paymentStatus}
                  onChange={e => setFormData({ ...formData, paymentStatus: e.target.value as any })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                >
                  <option value="unpaid" className="bg-[#141414]">Non Payé</option>
                  <option value="paid" className="bg-[#141414]">Payé</option>
                </select>
              </div>

              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Méthode de Paiement</label>
                <select
                  value={formData.paymentMethod}
                  disabled={formData.paymentStatus === 'unpaid'}
                  onChange={e => setFormData({ ...formData, paymentMethod: e.target.value as any })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none disabled:opacity-30"
                >
                  <option value="cash" className="bg-[#141414]">Espèces</option>
                  <option value="card" className="bg-[#141414]">Carte Bancaire</option>
                </select>
              </div>

              <div>
                <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Pourboire (€)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.tip}
                  onChange={e => setFormData({ ...formData, tip: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-white/60 text-xs mb-1.5 font-bold uppercase tracking-wider">Notes & Consignes</label>
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-4 h-4 text-[#D4AF37]" />
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:border-[#D4AF37] outline-none h-20 resize-none"
                  placeholder="Ex: Préfère une coupe courte sur les côtés..."
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black font-black uppercase text-sm rounded-xl hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all active:scale-[0.98]"
            >
              {isSubmitting ? "Création en cours..." : "Confirmer la Réservation"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
