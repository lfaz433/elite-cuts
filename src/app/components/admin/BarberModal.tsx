import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Image as ImageIcon } from 'lucide-react';
import type { Barber } from '../context/BusinessContext';

const BarberModal = ({ 
  barber, 
  onClose, 
  onSave, 
  isSaving, 
  handleImageUpload 
}: { 
  barber: Barber | null, 
  onClose: () => void, 
  onSave: (data: any) => void,
  isSaving: boolean,
  handleImageUpload: (file: File) => Promise<string>
}) => {
  const [formData, setFormData] = useState<Partial<Barber>>(
    barber || { 
      name: '', specialty: '', experience: '', rating: 5, image: '', 
      shiftStart: '09:00', shiftEnd: '18:00', workingDays: [1,2,3,4,5,6], 
      commission: 50, phone: '', email: '', status: 'available' 
    }
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-2xl bg-[#141414] rounded-3xl border border-[#D4AF37]/30 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-bold text-white">{barber ? 'Modifier' : 'Ajouter'} un Coiffeur</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6 text-white/40" /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Nom Complet</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="Ex: Jean Dupont" />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Spécialité</label>
                <input type="text" value={formData.specialty} onChange={e => setFormData({ ...formData, specialty: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="Ex: Maître Barbier" />
              </div>
              <div>
                <label className="block text-white/60 text-sm mb-2">Expérience</label>
                <input type="text" value={formData.experience} onChange={e => setFormData({ ...formData, experience: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="Ex: 5 ans" />
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-white/60 text-sm mb-2">Photo de Profil</label>
              <div className="relative aspect-square rounded-2xl bg-white/5 border-2 border-dashed border-white/10 overflow-hidden flex flex-col items-center justify-center gap-2 group hover:border-[#D4AF37]/50 transition-colors">
                {formData.image ? (
                  <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-white/20" />
                    <span className="text-xs text-white/20">Glissez ou cliquez</span>
                  </>
                )}
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = await handleImageUpload(file);
                    setFormData({ ...formData, image: url });
                  }
                }} />
              </div>
            </div>
          </div>
          <button onClick={() => onSave(formData)} disabled={isSaving} className="w-full mt-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-bold hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all active:scale-95 disabled:opacity-50">
            {isSaving ? 'Enregistrement...' : barber ? 'Mettre à jour' : 'Ajouter le coiffeur'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BarberModal;
