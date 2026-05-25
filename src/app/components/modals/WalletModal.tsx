import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, Wallet, Euro, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useBusiness, Barber } from '../context/BusinessContext';
import { addDoc, collection } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../../lib/firebase';
import { useTenant } from '../context/TenantContext';
import { toast } from 'sonner';

interface WalletModalProps {
  onClose: () => void;
  currentBarber: Barber;
}

const WalletModal: React.FC<WalletModalProps> = ({ onClose, currentBarber }) => {
  const { tenantId } = useTenant();
  const { bookings, payrollPayments, payrollRequests, getBarberWalletBalance, sendPush } = useBusiness();
  const [requestAmount, setRequestAmount] = useState<number | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const commissionRate = currentBarber.commissionRate || 50;
  
  // Calculate earnings breakdown
  const barberBookings = bookings.filter(b => b.barberId === currentBarber.id && b.status === 'completed');
  const totalCommission = barberBookings.reduce((sum, b) => sum + (Number(b.pricePaid || 0) * (commissionRate / 100)), 0);
  const totalTips = barberBookings.reduce((sum, b) => sum + Number(b.tip || 0), 0);
  
  const barberPayments = payrollPayments.filter(p => p.barberId === currentBarber.id);
  const totalPaid = barberPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  
  const balance = getBarberWalletBalance(currentBarber.id);

  // Recent payments
  const recentPayments = [...barberPayments].sort((a, b) => b.paidAt - a.paidAt).slice(0, 5);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId || !requestAmount || requestAmount <= 0 || requestAmount > balance) return;
    
    setIsSubmitting(true);
    try {
      const auth = getAuth();
      if (auth.currentUser) {
        await auth.currentUser.getIdToken(true);
      }

      await addDoc(collection(db, 'payroll_requests'), {
        tenantId,
        barberId: currentBarber.id,
        barberName: currentBarber.name,
        amount: Number(requestAmount),
        status: 'pending',
        requestedAt: Date.now()
      });
      
      // Notify admin UI
      await addDoc(collection(db, 'notifications'), {
        tenantId,
        recipientId: 'admin',
        title: 'Nouvelle demande de paiement',
        message: `💰 ${currentBarber.name} demande un paiement de €${requestAmount}`,
        type: 'payroll',
        createdAt: new Date().toISOString(),
        read: false
      });

      // Notify via Push
      await sendPush(
        'admin',
        '💰 Demande de paiement',
        `${currentBarber.name} demande un paiement de €${requestAmount}`,
        `/admin/paie`
      );

      toast.success('Demande envoyée ✓');
      setRequestAmount('');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('Erreur lors de la demande');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-lg bg-[#141414] rounded-[2.5rem] border border-[#D4AF37]/30 p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto custom-scrollbar">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/40 hover:text-white transition-colors">
          <X className="w-6 h-6" />
        </button>

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-[#D4AF37]/10 rounded-full flex items-center justify-center mb-4">
            <Wallet className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <h2 className="text-xl font-bold text-white/80">Mon Portefeuille</h2>
          <div className={`text-5xl font-black mt-2 ${balance < 0 ? 'text-red-500' : 'text-[#D4AF37]'}`}>
            €{balance.toFixed(2)}
          </div>
          <p className="text-white/40 text-sm mt-2">{commissionRate}% de vos services + 100% de vos pourboires</p>
        </div>

        {/* Breakdown */}
        <div className="bg-white/5 rounded-2xl p-6 mb-8 border border-white/10 space-y-4">
          <div className="flex justify-between items-center text-sm">
            <span className="text-white/60">Services ({commissionRate}%)</span>
            <span className="font-bold">€{totalCommission.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-white/60">Pourboires (100%)</span>
            <span className="font-bold">€{totalTips.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center text-sm text-red-400">
            <span>Déjà payé</span>
            <span className="font-bold">-€{totalPaid.toFixed(2)}</span>
          </div>
          <div className="h-px w-full bg-white/10 my-4"></div>
          <div className="flex justify-between items-center">
            <span className="text-white font-bold">Solde actuel</span>
            <span className={`text-xl font-black ${balance < 0 ? 'text-red-500' : 'text-[#D4AF37]'}`}>
              €{balance.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Request Form */}
        <form onSubmit={handleRequest} className="mb-8">
          <label className="block text-sm font-bold text-white/60 mb-2">Montant à demander (€)</label>
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Euro className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={balance > 0 ? balance : 0}
                required
                value={requestAmount}
                onChange={e => setRequestAmount(Number(e.target.value))}
                className="w-full bg-black border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:border-[#D4AF37] outline-none"
                placeholder="Ex: 50.00"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting || balance <= 0 || !requestAmount || requestAmount > balance}
              className="bg-[#D4AF37] hover:bg-[#FFD700] text-black font-black px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isSubmitting ? '...' : 'Demander →'}
            </button>
          </div>
        </form>

        {/* Recent Payments */}
        {recentPayments.length > 0 && (
          <div>
            <h3 className="text-sm font-bold text-white/60 mb-4 uppercase tracking-widest">Derniers paiements</h3>
            <div className="space-y-3">
              {recentPayments.map(payment => (
                <div key={payment.id} className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400" />
                    <div>
                      <div className="font-bold text-white text-sm">Paiement approuvé</div>
                      <div className="text-xs text-white/40">{new Date(payment.paidAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="font-black text-[#D4AF37]">€{payment.amount.toFixed(2)}</div>
                </div>
              ))}
              
              {/* Also show pending requests if any */}
              {payrollRequests
                .filter(r => r.barberId === currentBarber.id && r.status === 'pending')
                .map(req => (
                  <div key={req.id} className="flex justify-between items-center bg-white/5 p-4 rounded-xl border border-white/10 opacity-75">
                    <div className="flex items-center gap-3">
                      <Clock className="w-5 h-5 text-yellow-400" />
                      <div>
                        <div className="font-bold text-white text-sm">En attente</div>
                        <div className="text-xs text-white/40">{new Date(req.requestedAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="font-black text-white/60">€{req.amount.toFixed(2)}</div>
                  </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default WalletModal;
