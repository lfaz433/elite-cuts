import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Loader2, ArrowDownRight } from 'lucide-react';
import { toast } from 'sonner';
import { useBusiness } from '../context/BusinessContext';
import { useAuth } from '../context/AuthContext';

interface DepositModalProps {
  onClose: () => void;
}

export default function DepositModal({ onClose }: DepositModalProps) {
  const { addDeposit } = useBusiness();
  const { user } = useAuth();
  
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'fonds_caisse' | 'depot_especes' | 'remboursement' | 'autre'>('autre');
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !title) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error("Veuillez entrer un montant valide supérieur à 0.");
      return;
    }

    setIsSaving(true);
    try {
      await addDeposit({
        title,
        amount: numAmount,
        description: description.trim(),
        category,
        createdBy: user?.uid || 'unknown',
        createdByName: user?.name || user?.email || 'Administrateur'
      });
      toast.success("Dépôt enregistré avec succès !");
      onClose();
    } catch (error: any) {
      console.error(error);
      toast.error("Erreur lors de l'enregistrement: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const currentDateStr = new Date().toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-[#141414]/90 border border-white/10 p-8 rounded-3xl w-full max-w-md relative backdrop-blur-md shadow-2xl"
      >
        <button 
          onClick={onClose} 
          className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-6 h-6" />
        </button>

        <h3 className="text-2xl font-black text-white uppercase tracking-tight mb-2 flex items-center gap-2">
          <span className="p-1 bg-green-500/10 rounded-lg"><ArrowDownRight className="w-6 h-6 text-green-400" /></span>
          Ajouter à la caisse
        </h3>
        <p className="text-white/40 text-sm mb-6">
          Enregistrez un dépôt d'argent pour alimenter le solde de la caisse.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-black tracking-wider">
              Montant (€) <span className="text-[#D4AF37]">*</span>
            </label>
            <input 
              type="number" 
              step="0.01" 
              required
              value={amount} 
              onChange={(e) => setAmount(e.target.value)} 
              placeholder="0.00" 
              className="w-full bg-white/5 border border-white/10 p-3.5 rounded-2xl text-white font-bold focus:border-[#D4AF37] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-black tracking-wider">
              Titre <span className="text-[#D4AF37]">*</span>
            </label>
            <input 
              type="text" 
              required
              value={title} 
              onChange={(e) => setTitle(e.target.value)} 
              placeholder="ex: Fonds de caisse initial, Apport..." 
              className="w-full bg-white/5 border border-white/10 p-3.5 rounded-2xl text-white font-medium focus:border-[#D4AF37] focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-black tracking-wider">
              Catégorie <span className="text-[#D4AF37]">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="w-full bg-[#1c1c1c] border border-white/10 p-3.5 rounded-2xl text-white font-medium focus:border-[#D4AF37] focus:outline-none transition-colors"
            >
              <option value="fonds_caisse">Fonds de caisse</option>
              <option value="depot_especes">Dépôt espèces</option>
              <option value="remboursement">Remboursement</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          <div>
            <label className="block text-white/40 text-[10px] mb-1 uppercase font-black tracking-wider">
              Description / Notes
            </label>
            <textarea 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              placeholder="Détails supplémentaires..." 
              rows={3}
              className="w-full bg-white/5 border border-white/10 p-3.5 rounded-2xl text-white font-medium focus:border-[#D4AF37] focus:outline-none transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 text-xs border-t border-white/5">
            <div>
              <p className="text-white/40 font-semibold mb-0.5">Date & Heure</p>
              <p className="text-white/80 font-bold">{currentDateStr}</p>
            </div>
            <div>
              <p className="text-white/40 font-semibold mb-0.5">Créé par</p>
              <p className="text-white/80 font-bold truncate">{user?.name || user?.email || 'Administrateur'}</p>
            </div>
          </div>

          <div className="pt-4 flex flex-col gap-2">
            <button 
              type="submit" 
              disabled={isSaving}
              className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-500 disabled:from-emerald-800 disabled:to-green-800 text-white rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl shadow-green-500/10 hover:shadow-green-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Traitement...
                </>
              ) : (
                "Confirmer le dépôt"
              )}
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="w-full py-3 text-white/40 hover:text-white text-sm transition-colors"
            >
              ✕ Annuler
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
