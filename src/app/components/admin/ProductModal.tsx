import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Image as ImageIcon } from 'lucide-react';
import type { Product } from '../context/BusinessContext';

const ProductModal = ({ 
  product, 
  onClose, 
  onSave, 
  isSaving, 
  handleImageUpload 
}: { 
  product: Product | null, 
  onClose: () => void, 
  onSave: (data: any) => void,
  isSaving: boolean,
  handleImageUpload: (file: File) => Promise<string>
}) => {
  const [formData, setFormData] = useState<Partial<Product>>(
    product || { name: '', buyPrice: 0, sellPrice: 0, description: '', image: '', stock: 0, trackStock: true, category: 'Gel' }
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-3xl border border-[#D4AF37]/30 p-8">
        <div className="flex justify-between items-center mb-8">
          <h3 className="text-2xl font-bold text-white">{product ? 'Modifier' : 'Ajouter'} un Produit</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6 text-white/40" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-white/60 text-sm mb-2">Nom du Produit</label>
            <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/60 text-sm mb-2">Prix d'Achat (€)</label>
              <input type="number" value={formData.buyPrice} onChange={e => setFormData({ ...formData, buyPrice: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
            </div>
            <div>
              <label className="block text-white/60 text-sm mb-2">Prix de Vente (€)</label>
              <input type="number" value={formData.sellPrice} onChange={e => setFormData({ ...formData, sellPrice: parseFloat(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
            </div>
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">Stock Initial</label>
            <input type="number" value={formData.stock} onChange={e => setFormData({ ...formData, stock: parseInt(e.target.value) })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
          </div>
          <div>
            <label className="block text-white/60 text-sm mb-2">Photo du Produit</label>
            <div className="relative aspect-square rounded-xl bg-white/5 border-2 border-dashed border-white/10 overflow-hidden flex flex-col items-center justify-center gap-2 group hover:border-[#D4AF37]/50 transition-colors">
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
          {isSaving ? 'Enregistrement...' : product ? 'Mettre à jour' : 'Ajouter le produit'}
        </button>
      </motion.div>
    </div>
  );
};

export default ProductModal;
