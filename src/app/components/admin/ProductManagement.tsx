import { useState } from 'react';
import { Plus, Edit, Trash2, Package, Search } from 'lucide-react';

export const ProductManagement = ({ products, onEdit, onDelete, onAdd }: any) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProducts = products.filter((p: any) => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input 
            type="text" 
            placeholder="Rechercher un produit..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#141414] border border-white/10 rounded-2xl pl-11 pr-4 py-3 outline-none focus:border-[#D4AF37] transition-all"
          />
        </div>
        <button 
          onClick={onAdd}
          className="px-6 py-3 bg-[#D4AF37] text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-lg shadow-[#D4AF37]/20 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" /> Ajouter un Produit
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product: any) => (
          <div key={product.id} className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden group hover:border-[#D4AF37]/30 transition-all">
            <div className="h-48 bg-white/[0.02] flex items-center justify-center p-6 relative overflow-hidden">
              <img src={product.image} className="max-h-full object-contain group-hover:scale-110 transition-transform duration-500" onError={(e) => { (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1599305090598-fe179d501227?w=300&h=300&fit=crop'; }} />
              <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => onEdit(product)} className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:text-[#D4AF37]"><Edit className="w-4 h-4" /></button>
                <button onClick={() => onDelete(product.id)} className="p-2 bg-black/60 backdrop-blur-md rounded-lg text-white hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="absolute top-4 left-4">
                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  (product.stock || 0) > 10 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  Stock: {product.stock || 0}
                </span>
              </div>
            </div>
            <div className="p-6">
              <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold mb-1">{product.category || 'Général'}</p>
              <h4 className="font-bold text-lg mb-2 truncate">{product.name}</h4>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-white/20 text-[10px] uppercase font-bold">Prix de vente</p>
                  <p className="text-2xl font-bold text-[#D4AF37]">€{product.sellPrice}</p>
                </div>
                <div className="text-right">
                  <p className="text-white/20 text-[10px] uppercase font-bold">Marge</p>
                  <p className="text-sm font-bold text-green-400">€{(product.sellPrice - product.buyPrice).toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
