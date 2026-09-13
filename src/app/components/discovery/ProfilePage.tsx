import { useEffect, useState } from 'react';
import { ArrowLeft, MapPin, Scissors, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { getPublicProfile, type PublicProfile } from '../../lib/marketplace/discovery';
import { BookingRequestForm } from '../booking/BookingRequestForm';
import { useAuth } from '../context/AuthContext';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

export default function ProfilePage() {
  const { profileId = '' } = useParams();
  const { user } = useAuth();
  const [savingFavourite, setSavingFavourite] = useState(false);
  const saveFavourite = async () => {
    if (!user || !profile) return;
    setSavingFavourite(true);
    try {
      await setDoc(doc(db, 'clientFavourites', user.uid, 'items', profile.id), { profileId: profile.id });
    } finally { setSavingFavourite(false); }
  };
  const [profile, setProfile] = useState<PublicProfile | null>();

  useEffect(() => {
    let current = true;
    void getPublicProfile(profileId)
      .then(result => { if (current) setProfile(result); })
      .catch(() => { if (current) setProfile(null); });
    return () => { current = false; };
  }, [profileId]);

  if (profile === undefined) {
    return <main className="mx-auto min-h-screen max-w-6xl px-6 py-24 text-white/50">Chargement du profil…</main>;
  }
  if (!profile) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 text-white">
        <h1 className="text-3xl font-black">Profil indisponible</h1>
        <p className="mt-3 text-white/55">Ce profil n’est pas public dans une ville actuellement disponible.</p>
        <Link to="/discover" className="mt-8 inline-flex items-center gap-2 text-[#D4AF37]"><ArrowLeft className="h-4 w-4" /> Retour à la découverte</Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-white">
      <div className="mx-auto max-w-5xl">
        <Link to="/discover" className="inline-flex items-center gap-2 text-sm font-bold text-white/60 hover:text-[#D4AF37]"><ArrowLeft className="h-4 w-4" /> Découvrir</Link>
        <section className="mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[#141414]">
          {profile.portfolioUrls[0] && <img src={profile.portfolioUrls[0]} alt="" className="h-72 w-full object-cover sm:h-96" />}
          <div className="space-y-6 p-6 sm:p-10">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-[#D4AF37]">{profile.kind === 'salon' ? <Scissors className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}{profile.kind === 'salon' ? 'Salon' : 'Indépendant'}</p>
                <h1 className="mt-3 text-3xl font-black sm:text-5xl">{profile.displayName}</h1>
              </div>
              {profile.homeVisit && <span className="rounded-full bg-[#D4AF37]/10 px-3 py-1.5 text-xs font-black text-[#D4AF37]">À domicile</span>}
            </div>
            <p className="max-w-2xl text-lg leading-relaxed text-white/65">{profile.serviceSummary}</p>
            <p className="flex items-center gap-2 text-sm text-white/45"><MapPin className="h-4 w-4 text-[#D4AF37]" /> {profile.cityId.replace('fr-', '')}</p>
            {profile.portfolioUrls.length > 1 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{profile.portfolioUrls.slice(1).map(url => <img key={url} src={url} alt="" className="aspect-square rounded-2xl object-cover" loading="lazy" />)}</div>}
            {user ? <><button disabled={savingFavourite} onClick={() => void saveFavourite()} className="rounded-xl border border-[#D4AF37]/40 px-5 py-3 text-sm font-black text-[#D4AF37] disabled:opacity-50">{savingFavourite ? 'Enregistrement…' : 'Ajouter aux favoris'}</button><BookingRequestForm profile={profile} /></> : <Link to="/?login=true&returnTo=/discover" className="inline-flex rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black">Connectez-vous pour réserver</Link>}
          </div>
        </section>
      </div>
    </main>
  );
}
