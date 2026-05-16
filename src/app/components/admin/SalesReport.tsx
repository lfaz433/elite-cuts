import { useMemo } from 'react';
import { DollarSign, ShoppingBag, TrendingUp, Calendar } from 'lucide-react';

export const SalesReport = ({ sales, products, barbers }: any) => {
  const totalRevenue = useMemo(() => sales.reduce((sum: number, s: any) => sum + (s.sellPrice * s.quantity), 0), [sales]);
  const totalProfit = useMemo(() => sales.reduce((sum: number, s: any) => sum + ((s.sellPrice - s.buyPrice) * s.quantity), 0), [sales]);

  const recentSales = useMemo(() => [...sales].sort((a, b) => new Date(b.date + 'T' + b.time).getTime() - new Date(a.date + 'T' + a.time).getTime()), [sales]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-3xl">
          <div className="p-3 bg-green-500/10 rounded-2xl w-fit mb-4"><DollarSign className="text-green-400" /></div>
          <p className="text-white/40 text-sm">Chiffre d'Affaires</p>
          <p className="text-2xl font-bold">€{totalRevenue.toFixed(2)}</p>
        </div>
        <div className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-3xl">
          <div className="p-3 bg-blue-500/10 rounded-2xl w-fit mb-4"><TrendingUp className="text-blue-400" /></div>
          <p className="text-white/40 text-sm">Bénéfice Net</p>
          <p className="text-2xl font-bold">€{totalProfit.toFixed(2)}</p>
        </div>
        <div className="bg-[#141414] border border-[#D4AF37]/10 p-6 rounded-3xl">
          <div className="p-3 bg-purple-500/10 rounded-2xl w-fit mb-4"><ShoppingBag className="text-purple-400" /></div>
          <p className="text-white/40 text-sm">Produits Vendus</p>
          <p className="text-2xl font-bold">{sales.reduce((sum: number, s: any) => sum + s.quantity, 0)}</p>
        </div>
      </div>

      <div className="bg-[#141414] border border-[#D4AF37]/10 rounded-3xl overflow-hidden">
        <h3 className="px-6 py-4 font-bold border-b border-white/5">Ventes Récentes</h3>
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 text-white/40 text-xs uppercase tracking-widest border-b border-white/10">
              <th className="px-6 py-4">Produit</th>
              <th className="px-6 py-4">Vendeur</th>
              <th className="px-6 py-4">Date</th>
              <th className="px-6 py-4">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {recentSales.map((sale: any) => {
              const product = products.find((p: any) => p.id === sale.productId);
              const seller = barbers.find((b: any) => b.id === sale.sellerId);
              return (
                <tr key={sale.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <img src={product?.image} className="w-8 h-8 rounded-lg object-contain bg-white/5" />
                      <span className="font-medium">{product?.name || 'Inconnu'}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-white/60">{seller?.name || 'Inconnu'}</td>
                  <td className="px-6 py-4 text-white/40 text-sm">{sale.date} à {sale.time}</td>
                  <td className="px-6 py-4 font-bold text-[#D4AF37]">€{(sale.sellPrice * sale.quantity).toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
