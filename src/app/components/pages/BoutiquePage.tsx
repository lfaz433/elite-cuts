import { useState, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ShoppingBag, AlertTriangle, ArrowLeft, Filter, X, Tag, Star } from 'lucide-react';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { usePagination } from '../../hooks/usePagination';
import { PaginationBar } from '../ui/PaginationBar';
import { useAuth } from '../context/AuthContext';

const POSSaleModal = lazy(() => import('../modals/POSSaleModal').then(m => ({ default: m.POSSaleModal })));

const PRODUCTS_PER_PAGE = 12;

function StockBadge({ stock, threshold = 3 }: { stock?: number; threshold?: number }) {
  if (stock == null) return null;
  if (stock === 0) return (
    <span className="absolute top-3 left-3 px-2 py-1 bg-red-500/90 text-white text-[9px] font-black uppercase rounded-lg backdrop-blur-sm flex items-center gap-1">
      <AlertTriangle className="w-2.5 h-2.5" /> Épuisé
    </span>
  );
  if (stock <= threshold) return (
    <span className="absolute top-3 left-3 px-2 py-1 bg-amber-500/90 text-white text-[9px] font-black uppercase rounded-lg backdrop-blur-sm flex items-center gap-1">
      <AlertTriangle className="w-2.5 h-2.5" /> Stock faible
    </span>
  );
  return null;
}

function ProductCard({ product, onSelect, authUser }: { product: any; onSelect: () => void; authUser: any }) {
  const price = product.promoPrice ?? product.sellPrice;
  const hasPromo = !!product.promoPrice;
  const outOfStock = (product.stock ?? 1) === 0;
  const canBuy = authUser?.role === 'admin' || authUser?.role === 'barber';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      onClick={() => !outOfStock && canBuy && onSelect()}
      className={`relative bg-[#141414] border border-white/5 rounded-3xl overflow-hidden group transition-all ${
        outOfStock ? 'opacity-60 cursor-not-allowed' : canBuy ? 'cursor-pointer hover:border-[#D4AF37]/30 hover:shadow-2xl hover:shadow-[#D4AF37]/5' : 'cursor-default'
      }`}
    >
      {/* Image */}
      <div className="relative aspect-square bg-white/[0.03] overflow-hidden">
        <img
          src={product.image || 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=400&h=400&fit=crop'}
          alt={product.name}
          className={`w-full h-full object-cover transition-transform duration-500 ${outOfStock ? '' : 'group-hover:scale-110'}`}
          onError={e => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=400&h=400&fit=crop'; }}
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
        <StockBadge stock={product.stock} threshold={product.lowStockThreshold} />
        {hasPromo && !outOfStock && (
          <span className="absolute top-3 right-3 px-2 py-1 bg-[#D4AF37] text-black text-[9px] font-black uppercase rounded-lg flex items-center gap-1">
            <Tag className="w-2.5 h-2.5" /> PROMO
          </span>
        )}
        {!outOfStock && canBuy && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-[#D4AF37] text-black px-4 py-2 rounded-xl font-black text-sm shadow-xl transform scale-95 group-hover:scale-100 transition-transform flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" /> Acheter
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        {product.category && (
          <span className="text-[10px] text-white/30 font-black uppercase tracking-widest">{product.category}</span>
        )}
        <h3 className="font-bold text-white text-sm leading-tight mt-1 truncate">{product.name}</h3>
        {product.description && (
          <p className="text-white/40 text-xs mt-1 line-clamp-2 leading-relaxed">{product.description}</p>
        )}
        <div className="flex items-center justify-between mt-3">
          <div>
            <span className="text-[#D4AF37] font-black text-base">€{price.toFixed(2)}</span>
            {hasPromo && (
              <span className="text-white/30 line-through text-xs ml-2">€{product.sellPrice.toFixed(2)}</span>
            )}
          </div>
          {product.stock != null && product.stock > 0 && (
            <span className="text-white/30 text-[10px] font-bold">{product.stock} en stock</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function BoutiquePage() {
  const navigate = useNavigate();
  const { products, addSale, updateProduct, user } = useBusiness() as any;
  const { user: authUser } = useAuth();

  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Derive categories from products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    (products || []).forEach((p: any) => { if (p.category) cats.add(p.category); });
    return ['all', ...Array.from(cats)];
  }, [products]);

  // Filter products
  const filtered = useMemo(() => {
    return (products || []).filter((p: any) => {
      const matchCat = activeCategory === 'all' || p.category === activeCategory;
      const matchSearch = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()) || p.category?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, activeCategory, search]);

  const pagination = usePagination(filtered, PRODUCTS_PER_PAGE);

  const handleSell = async ({ productId, quantity, customPrice, discount, paymentMethod, notes }: any) => {
    const product = (products || []).find((p: any) => p.id === productId);
    if (!product) throw new Error('Produit introuvable');

    const now = new Date();
    const saleData = {
      productId,
      sellerId: authUser?.uid || 'boutique',
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0].substring(0, 5),
      quantity,
      buyPrice: product.buyPrice || 0,
      sellPrice: product.sellPrice || 0,
      customPrice,
      discount,
      paymentMethod,
      notes,
    };

    await addSale(saleData);

    // Deduct stock
    if (product.trackStock !== false && product.stock != null) {
      await updateProduct(productId, { stock: Math.max(0, product.stock - quantity) });
    }

    toast.success(`Vente enregistrée — €${(customPrice * quantity * (1 - discount / 100)).toFixed(2)}`);
    setSelectedProduct(null);
  };

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      {/* Hero nav */}
      <div className="sticky top-0 z-30 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-white/50 hover:text-white transition-colors text-sm font-bold"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>

          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[#D4AF37]" />
            <span className="font-black text-white tracking-tight">BOUTIQUE</span>
          </div>

          <button
            onClick={() => setShowFilters(f => !f)}
            className="flex items-center gap-2 text-white/50 hover:text-[#D4AF37] transition-colors text-sm font-bold"
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filtres</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Hero title */}
        <div className="text-center space-y-3">
          <motion.h1
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl sm:text-5xl font-black tracking-tighter bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent"
          >
            BOUTIQUE BARBEBOARD
          </motion.h1>
          <p className="text-white/40 text-sm max-w-md mx-auto">
            Produits professionnels sélectionnés pour sublimer votre style
          </p>
        </div>

        {/* Search + filters */}
        <div className="space-y-4">
          <div className="relative max-w-xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="w-full bg-[#141414] border border-white/10 rounded-2xl pl-12 pr-4 py-4 text-white placeholder:text-white/30 focus:border-[#D4AF37] outline-none transition-all text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category pills */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 justify-center flex-wrap">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); pagination.reset(); }}
                className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all border ${
                  activeCategory === cat
                    ? 'bg-[#D4AF37] text-black border-[#D4AF37] shadow-lg shadow-[#D4AF37]/20'
                    : 'bg-white/5 text-white/50 border-white/10 hover:border-white/30 hover:text-white'
                }`}
              >
                {cat === 'all' ? '✦ Tous les produits' : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-white/30 text-sm">
            <span className="text-white font-bold">{filtered.length}</span> produit{filtered.length !== 1 ? 's' : ''}
            {search && <> pour "<span className="text-[#D4AF37]">{search}</span>"</>}
          </p>
          {search && (
            <button onClick={() => setSearch('')} className="text-xs text-white/30 hover:text-white flex items-center gap-1">
              <X className="w-3 h-3" /> Réinitialiser
            </button>
          )}
        </div>

        {/* Product grid */}
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-24 space-y-4"
          >
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto">
              <ShoppingBag className="w-10 h-10 text-white/20" />
            </div>
            <p className="text-white/30 font-bold">Aucun produit trouvé</p>
            <p className="text-white/20 text-sm">Essayez une autre catégorie ou modifiez votre recherche</p>
          </motion.div>
        ) : (
          <>
            <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              <AnimatePresence>
                {pagination.paginated.map((product: any) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    authUser={authUser}
                    onSelect={() => setSelectedProduct(product)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
            <PaginationBar {...pagination} />
          </>
        )}

        {/* Low stock warning section */}
        {(products || []).some((p: any) => p.trackStock !== false && (p.stock ?? 0) <= (p.lowStockThreshold ?? 3) && (p.stock ?? 0) > 0) && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h4 className="font-black text-amber-400 text-sm uppercase tracking-wider">Alertes Stock Faible</h4>
            </div>
            <div className="flex flex-wrap gap-2">
              {(products || [])
                .filter((p: any) => p.trackStock !== false && (p.stock ?? 0) <= (p.lowStockThreshold ?? 3) && (p.stock ?? 0) > 0)
                .map((p: any) => (
                  <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-xl">
                    <span className="text-amber-400 font-bold text-xs">{p.name}</span>
                    <span className="text-amber-400/60 text-xs">({p.stock} restant{(p.stock ?? 0) > 1 ? 's' : ''})</span>
                  </div>
                ))
              }
            </div>
          </div>
        )}
      </div>

      {/* POS Modal */}
      <Suspense fallback={null}>
        <AnimatePresence>
          {selectedProduct && (
            <POSSaleModal
              product={selectedProduct}
              onClose={() => setSelectedProduct(null)}
              onSell={handleSell}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </div>
  );
}
