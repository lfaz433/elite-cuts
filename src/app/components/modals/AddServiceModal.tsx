import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '../context/BusinessContext';

interface AddServiceModalProps {
  bookingId: string;
  onClose: () => void;
}

export default function AddServiceModal({ bookingId, onClose }: AddServiceModalProps) {
  const { bookings, services, updateBooking } = useBusiness();
  const booking = bookings.find((b: any) => b.id === bookingId);
  const service = services.find((s: any) => s.id === booking?.serviceId);
  const [tip, setTip] = useState('0');
  const [pricePaid, setPricePaid] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');

  useEffect(() => {
    if (service) {
      setPricePaid((service.price || '').replace(/[^0-9]/g, ''));
    }
  }, [service]);

  if (!booking || !service) return null;

  const handleFinish = () => {
    const finalPrice = parseFloat(pricePaid) || 0;
    try {
      updateBooking(bookingId, { 
        status: 'completed', 
        pricePaid: finalPrice, 
        tip: parseFloat(tip) || 0, 
        paymentMethod,
        paymentStatus: 'paid'
      });
      toast.custom((t) => (
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="bg-[#141414] border-2 border-[#D4AF37] p-8 rounded-3xl flex flex-col items-center justify-center gap-6 shadow-[0_0_50px_rgba(212,175,55,0.3)] w-full max-w-sm mx-auto"
        >
          <div className="w-20 h-20 bg-[#D4AF37]/20 rounded-full flex items-center justify-center">
            <CheckCircle className="w-12 h-12 text-[#D4AF37]" />
          </div>
          <div className="text-center">
            <h3 className="text-2xl font-black text-white mb-2">SUCCÈS</h3>
            <p className="text-white/60 text-sm font-medium">L'action a été enregistrée avec succès.</p>
          </div>
        </motion.div>
      ), { duration: 2000, position: 'top-center' });
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error: any) {
      alert("ERREUR: " + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-[#141414] p-8 rounded-2xl border border-[#D4AF37]/30 w-full max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">Terminer Service</h3>
        <p className="text-white/60 mb-4">{service.name} - {service.price}</p>
        
        <label className="block text-white/40 text-sm mb-2">Méthode de paiement</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button 
            type="button" 
            onClick={() => setPaymentMethod('cash')} 
            className={`py-2 rounded-lg text-sm font-bold border ${paymentMethod === 'cash' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-transparent text-white/60 border-white/20'}`}
          >
            Espèce
          </button>
          <button 
            type="button" 
            onClick={() => setPaymentMethod('card')} 
            className={`py-2 rounded-lg text-sm font-bold border ${paymentMethod === 'card' ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-transparent text-white/60 border-white/20'}`}
          >
            Carte Bancaire
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-bold">Prix Payé (€)</label>
            <input type="number" value={pricePaid} onChange={(e) => setPricePaid(e.target.value)} className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white font-bold" />
          </div>
          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-bold">Pourboire (€)</label>
            <input type="number" value={tip} onChange={(e) => setTip(e.target.value)} className="w-full bg-white/5 border border-white/10 p-3 rounded-lg text-white font-bold" />
          </div>
        </div>
        <button type="button" onClick={handleFinish} className="w-full py-3 bg-[#D4AF37] text-black rounded-lg font-bold">Encaisser & Terminer</button>
        <button type="button" onClick={onClose} className="w-full mt-2 text-white/40">Annuler</button>
      </div>
    </div>
  );
}
