import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { captureReferralAttribution } from '../../lib/marketplace/referrals';

export default function ReferralLanding() {
  const { code = '' } = useParams();
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    try {
      setCaptured(captureReferralAttribution(code, window.localStorage) !== null);
    } catch {
      setCaptured(false);
    }
  }, [code]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-12 text-center text-white">
      <section className="w-full rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-8 shadow-2xl shadow-black/30">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#D4AF37] text-black"><Gift className="h-7 w-7" /></span>
        <h1 className="mt-5 text-3xl font-black">Vous avez été invité sur Barberboard</h1>
        {captured ? <><p className="mt-4 text-white/65">Le code <span className="font-mono font-black text-[#D4AF37]">{code.trim().toUpperCase()}</span> est enregistré uniquement sur cet appareil pendant 30 jours.</p><p className="mt-3 text-sm text-white/50">Aucun compte n’a été créé. Le crédit devient possible après votre premier rendez-vous terminé.</p></> : <p className="mt-4 text-white/65">Ce lien de parrainage n’est pas valide ou le stockage local est indisponible. Aucun compte n’a été créé.</p>}
        <Link to="/" className="mt-7 inline-flex rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black">Découvrir Barberboard</Link>
      </section>
    </main>
  );
}
