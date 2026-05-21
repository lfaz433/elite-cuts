import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Minus, ShoppingCart, CreditCard, Wallet, AlertTriangle, CheckCircle, Receipt, Tag } from 'lucide-react';
import { toast } from 'sonner';
import type { Product } from '../context/BusinessContext';

interface POSSaleModalProps {
  product: Product;
  currentBarber?: any;
  onClose: () => void;
  onSell: (saleData: {
    productId: string;
    quantity: number;
    customPrice: number;
    discount: number;
    paymentMethod: 'cash' | 'card';
    notes: string;
  }) => Promise<void>;
}

export function POSSaleModal({ product, currentBarber, onClose, onSell }: POSSaleModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [customPrice, setCustomPrice] = useState<string>(
    String(product.promoPrice ?? product.sellPrice)
  );
  const [discount, setDiscount] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [notes, setNotes] = useState('');
  const [isSelling, setIsSelling] = useState(false);
  const [success, setSuccess] = useState(false);

  const unitPrice = parseFloat(customPrice) || 0;
  const discountAmt = useMemo(() => unitPrice * quantity * (parseFloat(discount) || 0) / 100, [unitPrice, quantity, discount]);
  const subtotal = useMemo(() => Math.max(0, unitPrice * quantity - discountAmt), [unitPrice, quantity, discountAmt]);
  const profit = useMemo(() => Math.max(0, subtotal - (product.buyPrice || 0) * quantity), [subtotal, product.buyPrice, quantity]);

  const maxStock = product.stock ?? Infinity;
  const isOutOfStock = (product.stock ?? Infinity) === 0;
  const isLowStock = !isOutOfStock && (product.stock ?? 99) <= (product.lowStockThreshold ?? 3);

  const handleSell = async () => {
    if (quantity > maxStock) {
      toast.error(`Stock insuffisant. Maximum: ${maxStock} unités`);
      return;
    }
    setIsSelling(true);
    try {
      await onSell({ productId: product.id, quantity, customPrice: unitPrice, discount: parseFloat(discount) || 0, paymentMethod, notes });
      setSuccess(true);
      setTimeout(() => { onClose(); }, 1800);
    } catch (e: any) {
      toast.error(e.message || 'Erreur lors de la vente');
      setIsSelling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md">
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        className="w-full sm:max-w-md bg-[#111] border border-[#D4AF37]/20 sm:rounded-3xl rounded-t-3xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        <AnimatePresence>
          {success && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 z-10 bg-[#111] sm:rounded-3xl rounded-t-3xl flex flex-col items-center justify-center gap-6 p-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', bounce: 0.5 }}
                className="w-24 h-24 bg-green-500/10 border-2 border-green-500/30 rounded-full flex items-center justify-center"
              >
                <CheckCircle className="w-12 h-12 text-green-400" />
              </motion.div>
              <div className="text-center">
                <h3 className="text-2xl font-black text-white mb-2">VENTE ENREGISTRÉE</h3>
                <p className="text-white/50 text-sm">€{subtotal.toFixed(2)} encaissé en {paymentMethod === 'cash' ? 'espèces' : 'carte bancaire'}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#D4AF37]/10 rounded-xl flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <div>
              <h3 className="font-black text-white text-sm">Vente Produit</h3>
              <p className="text-white/40 text-xs">{product.category || 'Boutique'}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* Product card */}
          <div className="flex gap-4 p-4 bg-white/[0.03] border border-white/5 rounded-2xl">
            <img
              src={product.image || 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=120&h=120&fit=crop'}
              className="w-16 h-16 rounded-xl object-cover shrink-0"
              onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=120&h=120&fit=crop'; }}
            />
            <div className="flex-1 min-w-0">
              <p className="font-black text-white text-base leading-tight truncate">{product.name}</p>
              <p className="text-[#D4AF37] font-bold text-sm mt-0.5">
                €{Number(product.promoPrice ?? product.sellPrice ?? 0).toFixed(2)}
                {product.promoPrice && <span className="text-white/30 line-through text-xs ml-2">€{Number(product.sellPrice || 0).toFixed(2)}</span>}
              </p>
              {isOutOfStock && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-[10px] font-black mt-1">
                  <AlertTriangle className="w-3 h-3" /> Rupture de stock
                </span>
              )}
              {isLowStock && !isOutOfStock && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg text-[10px] font-black mt-1">
                  <AlertTriangle className="w-3 h-3" /> Stock faible ({product.stock})
                </span>
              )}
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Quantité {product.stock != null && <span className="text-white/20">(max {product.stock})</span>}</label>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white hover:bg-white/10 transition-colors active:scale-95"
              >
                <Minus className="w-5 h-5" />
              </button>
              <input
                type="number"
                min="1"
                max={product.stock ?? undefined}
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-black text-xl text-center focus:border-[#D4AF37] outline-none"
              />
              <button
                onClick={() => setQuantity(q => product.stock != null ? Math.min(product.stock, q + 1) : q + 1)}
                className="w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white hover:bg-white/10 transition-colors active:scale-95"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Custom price & discount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-1.5">Prix unitaire (€)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={customPrice}
                onChange={e => setCustomPrice(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-sm focus:border-[#D4AF37] outline-none"
              />
            </div>
            <div>
              <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-1.5">Remise (%)</label>
              <div className="relative">
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white font-bold text-sm focus:border-[#D4AF37] outline-none"
                />
                <Tag className="w-4 h-4 text-white/20 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Subtotal preview */}
          <div className="bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-white/50">Sous-total HT</span>
              <span className="text-white font-bold">€{(unitPrice * quantity).toFixed(2)}</span>
            </div>
            {parseFloat(discount) > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-400">Remise ({discount}%)</span>
                <span className="text-amber-400 font-bold">-€{discountAmt.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-black border-t border-white/10 pt-2 mt-2">
              <span className="text-white">Total à encaisser</span>
              <span className="text-[#D4AF37]">€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-white/30">Bénéfice estimé</span>
              <span className="text-green-400 font-bold">+€{profit.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-2">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'cash', label: 'Espèces', icon: Wallet },
                { id: 'card', label: 'Carte', icon: CreditCard },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setPaymentMethod(id as 'cash' | 'card')}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border transition-all ${
                    paymentMethod === id
                      ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/20'
                      : 'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-white/40 text-[10px] font-black uppercase tracking-widest mb-1.5">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Informations complémentaires…"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-[#D4AF37] outline-none resize-none placeholder:text-white/20"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 shrink-0 bg-[#111]">
          <button
            onClick={handleSell}
            disabled={isSelling || isOutOfStock || quantity > (product.stock ?? Infinity)}
            className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-2xl font-black text-base hover:shadow-xl hover:shadow-[#D4AF37]/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isSelling ? (
              <><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Enregistrement…</>
            ) : isOutOfStock ? (
              <><AlertTriangle className="w-5 h-5" /> Stock épuisé</>
            ) : (
              <><Receipt className="w-5 h-5" /> Encaisser €{subtotal.toFixed(2)}</>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
