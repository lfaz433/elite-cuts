import { useEffect, useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import DiscoveryMap from '../discovery/DiscoveryMap';
import ProfileCard from '../discovery/ProfileCard';
import {
  listEnabledCities,
  listPublicProfiles,
  type CityId,
  type PublicCity,
  type PublicProfile,
} from '../../lib/marketplace/discovery';

export default function DiscoverPage() {
  const [cities, setCities] = useState<PublicCity[]>([]);
  const [cityId, setCityId] = useState<CityId>();
  const [serviceId, setServiceId] = useState('');
  const [visitFilter, setVisitFilter] = useState<'all' | 'home' | 'salon'>('all');
  const [profiles, setProfiles] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    void listEnabledCities()
      .then(result => {
        if (!current) return;
        setCities(result);
        setCityId(previous => previous && result.some(city => city.id === previous) ? previous : result[0]?.id);
      })
      .catch(() => { if (current) setError('La découverte est temporairement indisponible.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  useEffect(() => {
    if (!cityId) {
      setProfiles([]);
      return;
    }
    let current = true;
    setLoading(true);
    setError('');
    void listPublicProfiles({
      cityId,
      ...(serviceId.trim() ? { serviceId: serviceId.trim() } : {}),
      ...(visitFilter === 'all' ? {} : { homeVisit: visitFilter === 'home' }),
    })
      .then(result => { if (current) setProfiles(result); })
      .catch(() => { if (current) setError('Les profils ne sont pas disponibles pour le moment.'); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [cityId, serviceId, visitFilter]);

  return (
    <main className="min-h-screen bg-black px-5 py-8 text-white sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-[#D4AF37]">Barberboard</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Découvrir les talents</h1>
        <p className="mt-3 max-w-2xl text-white/55">Découvrez les salons et indépendants approuvés dans les villes actuellement ouvertes.</p>

        <section className="mt-8 grid gap-3 rounded-3xl border border-white/10 bg-[#141414] p-4 md:grid-cols-[1fr_1.4fr_1fr]">
          <label className="text-xs font-bold uppercase tracking-wider text-white/45">Ville
            <select value={cityId ?? ''} onChange={event => setCityId(event.target.value as CityId)} className="mt-2 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm text-white outline-none focus:border-[#D4AF37]" disabled={cities.length === 0}>
              {cities.map(city => <option key={city.id} value={city.id}>{city.label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/45">Service
            <span className="relative mt-2 block"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/35" /><input value={serviceId} onChange={event => setServiceId(event.target.value)} placeholder="Ex. coupe, barbe" className="w-full rounded-xl border border-white/10 bg-black py-3 pl-10 pr-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-[#D4AF37]" /></span>
          </label>
          <label className="text-xs font-bold uppercase tracking-wider text-white/45">Disponibilité
            <span className="relative mt-2 block"><SlidersHorizontal className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-white/35" /><select value={visitFilter} onChange={event => setVisitFilter(event.target.value as 'all' | 'home' | 'salon')} className="w-full appearance-none rounded-xl border border-white/10 bg-black py-3 pl-10 pr-3 text-sm text-white outline-none focus:border-[#D4AF37]"><option value="all">Tous les profils</option><option value="salon">En salon</option><option value="home">À domicile</option></select></span>
          </label>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.85fr)]">
          <div className="grid gap-4 sm:grid-cols-2">
            {loading && <p className="col-span-full rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-white/45">Chargement des profils…</p>}
            {!loading && error && <p className="col-span-full rounded-2xl border border-red-400/20 bg-red-400/5 p-6 text-red-200">{error}</p>}
            {!loading && !error && profiles.length === 0 && <p className="col-span-full rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-white/45">Aucun profil public ne correspond encore à ces filtres.</p>}
            {profiles.map(profile => <ProfileCard key={profile.id} profile={profile} />)}
          </div>
          <div className="h-[360px] lg:sticky lg:top-6 lg:h-[calc(100vh-6rem)]"><DiscoveryMap profiles={profiles} /></div>
        </section>
      </div>
    </main>
  );
}
