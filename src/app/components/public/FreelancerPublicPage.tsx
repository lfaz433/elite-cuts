import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { getPublicFreelancerPageBySlug, type PublicFreelancerPage } from '../../lib/marketplace/publicFreelancer';
import GuestFreelancerBookingForm from './GuestFreelancerBookingForm';

const cities = { 'fr-paris': 'Paris', 'fr-grenoble': 'Grenoble', 'fr-mulhouse': 'Mulhouse' };
const money = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const rating = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const socialLabels: Record<string, string> = { instagram: 'Instagram', tiktok: 'TikTok', facebook: 'Facebook', website: 'Site web', whatsapp: 'WhatsApp' };
const sectionClass = 'rounded-3xl border border-white/10 bg-[#111] p-6 sm:p-8';

export function FreelancerPublicView({ page }: { page: PublicFreelancerPage }) {
  return <div className="min-h-screen bg-[#080808] text-white">
    <header className="border-b border-white/10 px-5 py-5">
      <p className="mx-auto max-w-6xl text-sm font-bold tracking-[0.15em] text-[#D4AF37]">BARBERBOARD</p>
    </header>
    <main className="mx-auto max-w-6xl space-y-7 px-5 py-8 sm:py-12">
      <section className="rounded-3xl border border-[#D4AF37]/25 bg-gradient-to-br from-[#29210e] to-[#111] p-6 sm:p-10">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          {page.profileImageUrl && <img src={page.profileImageUrl} alt={page.displayName} className="h-28 w-28 shrink-0 rounded-2xl object-cover" referrerPolicy="no-referrer" />}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[#e2c76c]">Barbier indépendant · {cities[page.cityId]}</p>
            <h1 className="mt-2 break-words text-4xl font-bold tracking-tight sm:text-5xl">{page.displayName}</h1>
            <p className="mt-4 max-w-2xl whitespace-pre-line text-lg leading-relaxed text-white/80">{page.serviceSummary}</p>
            <p className="mt-4 text-sm text-[#e2c76c]">{page.reviewSummary.count === 0 ? 'Nouveau sur Barberboard' : `${rating.format(page.reviewSummary.average!)} / 5 · ${page.reviewSummary.count} avis`}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              {page.workModes.chair && <span className="rounded-full border border-white/20 px-3 py-1.5">Au fauteuil</span>}
              {page.workModes.home && <span className="rounded-full border border-white/20 px-3 py-1.5">À domicile</span>}
            </div>
          </div>
        </div>
        <a href="#reservation" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-[#D4AF37] px-6 py-3 font-bold text-black hover:bg-[#e3c35b] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#D4AF37]">Demander un rendez-vous</a>
      </section>

      <div className="grid items-start gap-7 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-7">
          {page.bio && <section className={sectionClass}><h2 className="text-xl font-semibold">À propos</h2><p className="mt-4 whitespace-pre-line leading-relaxed text-white/75">{page.bio}</p></section>}
          {page.portfolioUrls.length > 0 && <section className={sectionClass}>
            <h2 className="text-xl font-semibold">Mes réalisations</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">{page.portfolioUrls.map((url, index) => <img key={url} src={url} alt={`Réalisation ${index + 1} de ${page.displayName}`} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full rounded-xl object-cover" />)}</div>
          </section>}
          <section className={sectionClass}>
            <h2 className="text-xl font-semibold">Prestations</h2>
            <ul className="mt-3 divide-y divide-white/10">{page.services.map(service => <li key={service.id} className="flex items-center justify-between gap-4 py-4">
              <div><h3 className="font-medium">{service.label}</h3><p className="mt-1 text-sm text-white/60">{service.durationMinutes} min</p></div>
              <p className="shrink-0 font-semibold text-[#e2c76c]">{money.format(service.priceMinor / 100)}</p>
            </li>)}</ul>
          </section>
          {page.workModes.chair && page.workplace && <section className={sectionClass}>
            <h2 className="text-xl font-semibold">Rendez-vous au fauteuil</h2>
            <p className="mt-4 font-medium">{page.workplace.name}</p>
            <p className="mt-1 leading-relaxed text-white/75">{page.workplace.line1}<br />{page.workplace.postalCode} {page.workplace.city}</p>
          </section>}
          {Object.keys(page.socialLinks).length > 0 && <section className={sectionClass}>
            <h2 className="text-xl font-semibold">Retrouvez-moi</h2>
            <div className="mt-4 flex flex-wrap gap-3">{Object.entries(page.socialLinks).map(([platform, value]) => <a key={platform} href={platform === 'whatsapp' ? `https://wa.me/${value.slice(1)}` : value} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-white/20 px-4 py-3 text-sm hover:border-[#D4AF37] focus-visible:outline-2 focus-visible:outline-[#D4AF37]">{socialLabels[platform]}</a>)}</div>
          </section>}
          <section className={sectionClass}>
            <h2 className="text-xl font-semibold">Avis clients</h2>
            {page.reviewSummary.count === 0 ? <p className="mt-4 text-white/75">Nouveau sur Barberboard</p> : <>
              <p className="mt-4 text-[#e2c76c]">{rating.format(page.reviewSummary.average!)} / 5 · {page.reviewSummary.count} avis</p>
              <ul className="mt-4 divide-y divide-white/10">{page.reviewSummary.reviews.map((review, index) => <li key={`${review.createdAtMs}-${index}`} className="py-4">
                <p className="font-medium">{review.authorName} <span className="ml-2 text-sm text-[#e2c76c]">{review.rating} / 5</span></p>
                {review.text && <p className="mt-2 whitespace-pre-line leading-relaxed text-white/75">{review.text}</p>}
              </li>)}</ul>
            </>}
          </section>
        </div>

        <section id="reservation" aria-labelledby="reservation-title" tabIndex={-1} className={`${sectionClass} scroll-mt-6 focus:outline-none`}>
          <h2 id="reservation-title" className="text-2xl font-semibold">Votre rendez-vous</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/65">Choisissez une prestation et un créneau, puis transmettez votre demande.</p>
          <div className="my-5 rounded-xl border border-white/10 bg-black/20 p-4 text-sm leading-relaxed text-white/70">
            <h3 className="font-medium text-white">Conditions d’annulation</h3>
            <p className="mt-1">{page.cancellationWindowHours === 0 ? 'Annulation possible jusqu’au début du rendez-vous.' : `Annulation possible jusqu’à ${page.cancellationWindowHours} h avant le rendez-vous.`}</p>
          </div>
          <GuestFreelancerBookingForm key={page.publicSlug} page={page} />
        </section>
      </div>
    </main>
    <footer className="px-5 py-8 text-center text-xs text-white/50">Barberboard · Le rendez-vous avec votre barbier</footer>
  </div>;
}

type PageState = { slug: string; page?: PublicFreelancerPage; error?: 'missing' | 'retry' };

export default function FreelancerPublicPage() {
  const { publicSlug = '' } = useParams<{ publicSlug: string }>();
  const [state, setState] = useState<PageState>({ slug: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ slug: publicSlug });
    getPublicFreelancerPageBySlug(publicSlug).then(page => {
      if (active) setState({ slug: publicSlug, page });
    }).catch(error => {
      if (active) setState({ slug: publicSlug, error: error?.code === 'functions/not-found' || error?.message === 'publicSlug is invalid' ? 'missing' : 'retry' });
    });
    return () => { active = false; };
  }, [publicSlug, attempt]);

  if (state.slug !== publicSlug || (!state.page && !state.error)) return <main className="grid min-h-screen place-items-center bg-[#080808] px-6 text-white"><p role="status">Chargement du profil…</p></main>;
  if (state.error) return <main className="flex min-h-screen flex-col items-center justify-center bg-[#080808] px-6 text-center text-white">
    <h1 className="text-2xl font-semibold">{state.error === 'missing' ? 'Profil indisponible' : 'Chargement impossible'}</h1>
    <p role="alert" className="mt-3 max-w-md text-white/70">{state.error === 'missing' ? 'Ce lien ne correspond pas à un profil disponible pour le moment.' : 'Le profil ne peut pas être chargé pour le moment. Veuillez réessayer.'}</p>
    {state.error === 'retry' && <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-6 rounded-xl border border-[#D4AF37] px-5 py-3 text-[#e2c76c]">Réessayer</button>}
  </main>;
  return <FreelancerPublicView key={state.page!.publicSlug} page={state.page!} />;
}
