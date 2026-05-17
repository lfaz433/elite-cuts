import { useState } from 'react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { CheckCircle } from 'lucide-react';

/**
 * useSaveEntity - generic hook for any create/update operation.
 * @param saveFn async function that performs the actual save (e.g., addBarber, addService).
 * @returns { isSaving, handleSave }
 */
export function useSaveEntity<T>(saveFn: (data: T) => Promise<void>) {
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (data: T) => {
    setIsSaving(true);
    try {
      await saveFn(data);
      // Premium success toast
      toast.custom((t) => (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#141414] border-2 border-[#D4AF37] p-6 rounded-3xl flex items-center gap-4 shadow-[0_0_50px_rgba(212,175,55,0.3)]"
        >
          <CheckCircle className="w-8 h-8 text-[#D4AF37]" />
          <span className="text-white">Enregistré avec succès</span>
        </motion.div>
      ), { duration: 1800, position: 'top-center' });
    } catch (err: any) {
      console.error('Save error:', err);
      toast.error(err.message || 'Erreur lors de l\'enregistrement');
      throw err; // re‑throw to let caller handle any cleanup
    } finally {
      setIsSaving(false);
    }
  };

  return { isSaving, handleSave };
}
