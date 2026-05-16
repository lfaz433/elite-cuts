import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Image as ImageIcon } from 'lucide-react';
import type { Service } from '../context/BusinessContext';

const ServiceModal = ({ 
  service, 
  onClose, 
  onSave, 
  isSaving, 
  handleImageUpload 
}: { 
  service: Service | null, 
  onClose: () => void, 
  onSave: (data: any) => void,
  isSaving: boolean,
  handleImageUpload: (file: File) => Promise<string>
}) => {
  const [formData, setFormData] = useState<Partial<Service>>(
    service || { name: '', price: '', duration: '', description: '', image: '' }
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-bold text-white">{service ? 'Modifier' : 'Ajouter'} un Service</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6 text-white/40" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm mb-2">Nom du Service</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-sm mb-2">Prix (ex: 25€)</label>
              <input type="text" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-2">Durée (ex: 45 min)</label>
              <input type="text" value={formData.duration} onChange={e => setFormData({ ...formData, duration: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">Description</label>
            <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors h-20 resize-none" />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">Photo du Service</label>
            <div className="relative aspect-video rounded-xl bg-white/5 border-2 border-dashed border-white/10 overflow-hidden flex flex-col items-center justify-center gap-2 group hover:border-[#D4AF37]/50 transition-colors">
              {formData.image ? (
                <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <ImageIcon className="w-6 h-6 text-white/20" />
                  <span className="text-[10px] text-white/20 uppercase font-bold">Upload Photo</span>
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
          {isSaving ? 'Enregistrement...' : service ? 'Mettre à jour' : 'Ajouter le service'}
        </button>
      </motion.div>
    </div>
  );
};

export default ServiceModal;
