import { Heart } from 'lucide-react';
import { Link } from 'react-router';
export interface Favourite { id: string; profileId: string; }
export function Favourites({ favourites }: { favourites: Favourite[] }) {
  if (favourites.length === 0) return <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center text-white/55"><Heart className="mx-auto mb-3 h-9 w-9 text-[#D4AF37]/60" />Aucun favori enregistré.</div>;
  return <div className="grid gap-3 sm:grid-cols-2">{favourites.map(favourite => <Link key={favourite.id} to={`/discover/${favourite.profileId}`} className="rounded-2xl border border-[#D4AF37]/20 bg-[#141414] p-5 font-bold text-white hover:border-[#D4AF37]">{favourite.profileId}</Link>)}</div>;
}
