import { useMemo } from 'react';
import { DollarSign, Scissors, TrendingUp, Calendar, CreditCard, Wallet, ShoppingBag } from 'lucide-react';

export const FinanceReport = ({ bookings, services, sales }: any) => {
  const completedBookings = bookings.filter((b: any) => b.status === 'completed' || b.status === 'approved');
  
  const stats = useMemo(() => {
    const serviceRevenue = completedBookings.reduce((sum: number, b: any) => sum + (b.pricePaid || 0), 0);
    const productRevenue = sales.reduce((sum: number, s: any) => sum + (s.sellPrice * s.quantity), 0);
    const totalTips = completedBookings.reduce((sum: number, b: any) => sum + (b.tip || 0), 0);
    const cashTotal = completedBookings.filter((b: any) => b.paymentMethod === 'cash').reduce((sum: number, b: any) => sum + (b.pricePaid || 0), 0);
    const cardTotal = completedBookings.filter((b: any) => b.paymentMethod === 'card').reduce((sum: number, b: any) => sum + (b.pricePaid || 0), 0);

    return {
      total: serviceRevenue + productRevenue,
      services: serviceRevenue,
      products: productRevenue,
      tips: totalTips,
      cash: cashTotal,
      card: cardTotal
    };
  }, [completedBookings, sales]);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-[#D4AF37] to-[#FFD700] p-8 rounded-3xl text-black">
          <p className="text-black/60 text-sm font-bold uppercase tracking-wider mb-2">Chiffre d'Affaires Global</p>
          <p className="text-5xl font-black">€{stats.total.toFixed(2)}</p>
          <div className="mt-6 flex gap-4 text-xs font-bold opacity-60">
            <span className="flex items-center gap-1"><Scissors className="w-3 h-3" /> Services: €{stats.services}</span>
            <span className="flex items-center gap-1"><ShoppingBag className="w-3 h-3" /> Boutique: €{stats.products}</span>
          </div>
        </div>
        
        <div className="bg-[#141414] border border-white/10 p-8 rounded-3xl">
          <p className="text-white/40 text-sm font-bold uppercase tracking-wider mb-6">Répartition Paiements</p>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg"><Wallet className="w-4 h-4 text-green-400" /></div>
                <span className="text-white/80">Espèces</span>
              </div>
              <span className="font-bold">€{stats.cash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg"><CreditCard className="w-4 h-4 text-blue-400" /></div>
                <span className="text-white/80">Carte Bancaire</span>
              </div>
              <span className="font-bold">€{stats.card.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#141414] border border-white/10 p-8 rounded-3xl">
          <p className="text-white/40 text-sm font-bold uppercase tracking-wider mb-6">Statistiques Client</p>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-white/60">Panier Moyen</span>
              <span className="font-bold">€{(stats.total / (completedBookings.length || 1)).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Taux de Remplissage</span>
              <span className="font-bold">85%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#141414] border border-white/10 rounded-3xl overflow-hidden">
        <h3 className="px-6 py-4 font-bold border-b border-white/5">Dernières Transactions</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 text-white/40 text-[10px] uppercase tracking-widest border-b border-white/10">
                <th className="px-6 py-4">Détails</th>
                <th className="px-6 py-4">Méthode</th>
                <th className="px-6 py-4">Montant</th>
                <th className="px-6 py-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {completedBookings.slice(0, 10).map((b: any) => (
                <tr key={b.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <p className="font-bold text-sm">{b.clientName}</p>
                    <p className="text-white/40 text-[10px]">{services.find((s: any) => s.id === b.serviceId)?.name}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                      b.paymentMethod === 'cash' ? 'bg-green-500/10 text-green-400' : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {b.paymentMethod || 'Inconnu'}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold">€{(b.pricePaid || 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-white/40 text-xs">{b.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
