import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { ReferralStorageUnavailableError, validateAndCaptureReferralCode } from '../../lib/marketplace/referrals';

type ReferralState =
  | { status: 'loading' }
  | { status: 'verified'; code: string }
  | { status: 'unavailable' }
  | { status: 'storage-unavailable' };

export default function ReferralLanding() {
  const { code = '' } = useParams();
  const [state, setState] = useState<ReferralState>({ status: 'loading' });

  useEffect(() => {
    let current = true;
    setState({ status: 'loading' });
    void validateAndCaptureReferralCode(code, () => window.localStorage).then(capture => {
      if (!current) return;
      setState(capture ? { status: 'verified', code: capture.code } : { status: 'storage-unavailable' });
    }).catch(reason => {
      if (!current) return;
      setState(reason instanceof ReferralStorageUnavailableError ? { status: 'storage-unavailable' } : { status: 'unavailable' });
    });
    return () => { current = false; };
  }, [code]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl items-center px-5 py-12 text-center text-white">
      <section className="w-full rounded-3xl border border-[#D4AF37]/25 bg-[#111] p-8 shadow-2xl shadow-black/30">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#D4AF37] text-black"><Gift className="h-7 w-7" /></span>
        <h1 className="mt-5 text-3xl font-black">{state.status === 'verified' ? 'Vous avez été invité sur Barberboard' : state.status === 'loading' ? 'Vérification de votre lien' : 'Lien de parrainage indisponible'}</h1>
        {state.status === 'loading' ? <p className="mt-4 text-white/65">Vérification sécurisée du lien de parrainage…</p> : state.status === 'verified' ? <><p className="mt-4 text-white/65">Le code <span className="font-mono font-black text-[#D4AF37]">{state.code}</span> est enregistré uniquement sur cet appareil et expire dans 30 jours.</p><p className="mt-3 text-sm text-white/50">Aucun compte n’a été créé. Le crédit devient possible après votre premier rendez-vous terminé.</p></> : state.status === 'storage-unavailable' ? <p className="mt-4 text-white/65">Ce lien a été vérifié, mais son enregistrement local est indisponible sur cet appareil. Aucun compte n’a été créé.</p> : <p className="mt-4 text-white/65">Ce lien n’est pas disponible : le code est introuvable, en pause ou expiré. Aucun compte n’a été créé.</p>}
        <Link to="/" className="mt-7 inline-flex rounded-xl bg-[#D4AF37] px-5 py-3 text-sm font-black text-black">Découvrir Barberboard</Link>
      </section>
    </main>
  );
}
