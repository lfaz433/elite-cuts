import { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { X, Image as ImageIcon, Package, Tag, AlertTriangle, ChevronDown } from 'lucide-react';
import type { Product } from '../context/BusinessContext';

const PRESET_CATEGORIES = ['Gel', 'Shampoing', 'Cire', 'Tonique', 'Huile', 'Accessoires', 'Parfum', 'Après-rasage', 'Autre'];

const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:border-[#D4AF37] outline-none transition-colors placeholder:text-white/20';
const labelCls = 'block text-white/40 text-[10px] font-black uppercase tracking-widest mb-1.5';

const ProductModal = ({
  product,
  onClose,
  onSave,
  isSaving,
  handleImageUpload
}: {
  product: Product | null;
  onClose: () => void;
  onSave: (data: any) => void;
  isSaving: boolean;
  handleImageUpload: (file: File) => Promise<string>;
}) => {
  const [formData, setFormData] = useState<Partial<Product>>(
    product ?? {
      name: '',
      buyPrice: 0,
      sellPrice: 0,
      promoPrice: undefined,
      description: '',
      image: '',
      stock: 0,
      category: 'Gel',
      trackStock: true,
      barcode: '',
      lowStockThreshold: 3,
    }
  );
  const [customCat, setCustomCat] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (key: keyof Product, val: any) => setFormData(p => ({ ...p, [key]: val }));

  const handleFile = async (file: File) => {
    setImageLoading(true);
    try {
      const url = await handleImageUpload(file);
      set('image', url);
    } finally {
      setImageLoading(false);
    }
  };

  const handleSave = () => {
    if (!formData.name?.trim()) return;
    const sellPrice = parseFloat(String(formData.sellPrice)) || 0;
    const buyPrice = parseFloat(String(formData.buyPrice)) || 0;
    const payload: any = { ...formData, sellPrice, buyPrice };
    
    if (formData.promoPrice != null && String(formData.promoPrice).trim() !== '') {
      payload.promoPrice = parseFloat(String(formData.promoPrice));
    }
    
    // Clean up undefined values for Firebase
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    
    onSave(payload);
  };

  const stockLevel = () => {
    const s = formData.stock ?? 0;
    const t = formData.lowStockThreshold ?? 3;
    if (s === 0) return 'out';
    if (s <= t) return 'low';
    return 'ok';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/90 backdrop-blur-md">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="relative w-full sm:max-w-lg bg-[#111] border border-[#D4AF37]/20 sm:rounded-3xl rounded-t-3xl flex flex-col"
        style={{ maxHeight: '92vh' }}
      >
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#D4AF37]/10 rounded-xl flex items-center justify-center">
              <Package className="w-5 h-5 text-[#D4AF37]" />
            </div>
            <h3 className="text-lg font-black text-white">{product ? 'Modifier' : 'Nouveau'} Produit</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Image Upload */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative h-36 rounded-2xl bg-white/5 border-2 border-dashed border-white/10 overflow-hidden flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-[#D4AF37]/40 transition-colors group"
          >
            {formData.image ? (
              <img src={formData.image} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <>
                <ImageIcon className={`w-8 h-8 ${imageLoading ? 'animate-pulse text-[#D4AF37]' : 'text-white/20'}`} />
                <span className="text-[10px] text-white/30 font-black uppercase">{imageLoading ? 'Chargement…' : 'Cliquez pour ajouter une photo'}</span>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {formData.image && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs font-bold">Changer la photo</span>
              </div>
            )}
          </div>

          {/* Name */}
          <div>
            <label className={labelCls}>Nom du Produit *</label>
            <input type="text" value={formData.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="Ex: Gel coiffant premium" />
          </div>

          {/* Category */}
          <div>
            <label className={labelCls}><Tag className="w-3 h-3 inline mr-1" />Catégorie</label>
            {!showCatInput ? (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select
                    value={formData.category}
                    onChange={e => set('category', e.target.value)}
                    className={`${inputCls} appearance-none pr-10`}
                  >
                    {PRESET_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="w-4 h-4 text-white/30 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <button onClick={() => setShowCatInput(true)} className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white/50 hover:text-[#D4AF37] hover:border-[#D4AF37]/30 transition-colors font-bold whitespace-nowrap">
                  + Nouvelle
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customCat}
                  onChange={e => setCustomCat(e.target.value)}
                  placeholder="Nom de la catégorie…"
                  className={`${inputCls} flex-1`}
                  autoFocus
                />
                <button
                  onClick={() => { if (customCat.trim()) { set('category', customCat.trim()); } setShowCatInput(false); setCustomCat(''); }}
                  className="px-4 py-3 bg-[#D4AF37] text-black rounded-xl text-xs font-black"
                >
                  OK
                </button>
                <button onClick={() => { setShowCatInput(false); setCustomCat(''); }} className="px-3 py-3 bg-white/5 text-white/40 rounded-xl text-xs">
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              value={formData.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              className={`${inputCls} resize-none`}
              placeholder="Description courte du produit…"
            />
          </div>

          {/* Barcode */}
          <div>
            <label className={labelCls}>Référence / Code-barres</label>
            <input type="text" value={formData.barcode ?? ''} onChange={e => set('barcode', e.target.value)} className={inputCls} placeholder="Ex: REF-001" />
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Prix Achat (€)</label>
              <input type="number" step="0.01" min="0" value={formData.buyPrice} onChange={e => set('buyPrice', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Prix Vente (€)</label>
              <input type="number" step="0.01" min="0" value={formData.sellPrice} onChange={e => set('sellPrice', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Prix Promo (€)</label>
              <input type="number" step="0.01" min="0" value={formData.promoPrice ?? ''} onChange={e => set('promoPrice', e.target.value ? e.target.value : undefined)} className={inputCls} placeholder="—" />
            </div>
          </div>

          {/* Stock */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Stock Actuel</label>
              <input type="number" min="0" value={formData.stock} onChange={e => set('stock', parseInt(e.target.value) || 0)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Seuil Stock Faible</label>
              <input type="number" min="1" value={formData.lowStockThreshold ?? 3} onChange={e => set('lowStockThreshold', parseInt(e.target.value) || 3)} className={inputCls} />
            </div>
          </div>

          {/* Stock level indicator */}
          {formData.trackStock && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold ${
              stockLevel() === 'out' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
              stockLevel() === 'low' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
              'bg-green-500/10 text-green-400 border border-green-500/20'
            }`}>
              {stockLevel() === 'out' && <><AlertTriangle className="w-4 h-4" /> Rupture de stock</>}
              {stockLevel() === 'low' && <><AlertTriangle className="w-4 h-4" /> Stock faible ({formData.stock} unités)</>}
              {stockLevel() === 'ok' && <>✓ En stock ({formData.stock} unités)</>}
            </div>
          )}

          {/* Track stock toggle */}
          <div className="flex items-center justify-between py-2 border-t border-white/5">
            <div>
              <p className="text-sm font-bold text-white">Suivi du stock</p>
              <p className="text-xs text-white/40">Décrémenter automatiquement à chaque vente</p>
            </div>
            <button
              onClick={() => set('trackStock', !formData.trackStock)}
              className={`relative w-12 h-6 rounded-full transition-colors ${formData.trackStock ? 'bg-[#D4AF37]' : 'bg-white/10'}`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform shadow ${formData.trackStock ? 'translate-x-7' : 'translate-x-1'}`} />
            </button>
          </div>

        </div>

        {/* Sticky Footer */}
        <div className="px-6 py-4 border-t border-white/5 shrink-0 bg-[#111]">
          <button
            onClick={handleSave}
            disabled={isSaving || !formData.name?.trim()}
            className="w-full py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-2xl font-black text-sm hover:shadow-xl hover:shadow-[#D4AF37]/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? '⏳ Enregistrement…' : product ? '✓ Mettre à jour le produit' : '+ Ajouter le produit'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ProductModal;
