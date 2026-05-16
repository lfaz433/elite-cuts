import { useState } from 'react';
import { motion } from 'motion/react';
import { X, ShoppingBag, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';

export const SaleModal = ({ onClose, products, currentBarber, addSale }: any) => {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const selectedProduct = products.find((p: any) => p.id === selectedProductId);

  const handleSale = async () => {
    if (!selectedProductId || !selectedProduct) return;
    setIsSaving(true);
    try {
      await addSale({
        productId: selectedProductId,
        sellerId: currentBarber.id,
        quantity: quantity,
        buyPrice: selectedProduct.buyPrice,
        sellPrice: selectedProduct.sellPrice
      });
      toast.success("Vente enregistrée !");
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-md bg-[#141414] rounded-[2.5rem] border border-[#D4AF37]/30 p-8 shadow-2xl">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/40 hover:text-white transition-colors"><X /></button>
        
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-[#D4AF37]/10 rounded-2xl"><ShoppingBag className="text-[#D4AF37]" /></div>
          <h3 className="text-2xl font-black uppercase tracking-tight">Nouvelle Vente</h3>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-3">Sélectionner Produit</label>
            <select 
              value={selectedProductId} 
              onChange={(e) => { setSelectedProductId(e.target.value); setQuantity(1); }}
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-[#D4AF37] font-bold text-white appearance-none"
            >
              <option value="" className="bg-[#141414]">Choisir un produit...</option>
              {products.map((p: any) => (
                <option key={p.id} value={p.id} className="bg-[#141414]">{p.name} - €{p.sellPrice}</option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-white/5 rounded-3xl border border-white/5">
                <div>
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest mb-1">Prix Unitaire</p>
                  <p className="text-2xl font-black text-[#D4AF37]">€{selectedProduct.sellPrice}</p>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"><Minus className="w-4 h-4" /></button>
                  <span className="text-xl font-black w-8 text-center">{quantity}</span>
                  <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"><Plus className="w-4 h-4" /></button>
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <div className="flex justify-between items-end mb-8">
                  <p className="text-white/40 text-[10px] font-black uppercase tracking-widest">Total à encaisser</p>
                  <p className="text-4xl font-black text-green-400">€{(selectedProduct.sellPrice * quantity).toFixed(2)}</p>
                </div>

                <button 
                  onClick={handleSale}
                  disabled={isSaving}
                  className="w-full py-5 bg-[#D4AF37] text-black font-black uppercase tracking-widest rounded-[1.5rem] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-[#D4AF37]/20 disabled:opacity-50"
                >
                  {isSaving ? "Enregistrement..." : "Encaisser la Vente"}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
