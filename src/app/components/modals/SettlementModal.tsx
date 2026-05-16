import { useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { toast } from 'sonner';

const SettlementModal = ({ onClose, todayEarnings, currentBarber, addSettlement }: any) => {
  const [amountPaid, setAmountPaid] = useState(todayEarnings.total.toString());
  const balance = todayEarnings.total - parseFloat(amountPaid || '0');
  const handleSettle = () => {
    addSettlement({
      barberId: currentBarber.id,
      date: new Date().toISOString().split('T')[0],
      earnings: todayEarnings.total,
      paid: parseFloat(amountPaid || '0'),
      balance: balance,
      status: balance <= 0 ? 'settled' : 'pending'
    });
    toast.success("✅ Action completed successfully");
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8">
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40"><X /></button>
        <h3 className="text-2xl font-bold text-white mb-6">Clôturer</h3>
        <div className="space-y-4 mb-8">
          <div className="flex justify-between p-4 bg-white/5 rounded-xl border border-white/10">
            <span className="text-white/60">Total</span>
            <span className="text-white font-bold">€{todayEarnings.total.toFixed(2)}</span>
          </div>
          <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-xl text-white text-xl font-bold" />
        </div>
        <button onClick={handleSettle} className="w-full py-4 bg-[#D4AF37] text-black rounded-xl font-bold">Confirmer</button>
      </motion.div>
    </div>
  );
};

export default SettlementModal;
