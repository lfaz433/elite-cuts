import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useTenant } from '../context/TenantContext';
import { motion } from 'motion/react';
import { CreditCard, Check, ShieldAlert, Sparkles, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';

type PlanId = 'basic' | 'pro';

export default function Billing() {
  const tenant = useTenant();
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const expired = searchParams.get('expired') === 'true';
  const [loadingPlan, setLoadingPlan] = useState<PlanId | null>(null);

  const { tenantId, subscription } = tenant;
  const currentPlan = subscription?.planId || 'basic';
  const status = subscription?.status || 'trialing';

  // Calculate remaining trial days
  const trialEndsAt = subscription?.trialEndsAt || 0;
  const daysRemaining = trialEndsAt 
    ? Math.max(0, Math.ceil((trialEndsAt - Date.now()) / (1000 * 60 * 60 * 24)))
    : 0;

  const handleSelectPlan = async (planId: PlanId) => {
    setLoadingPlan(planId);
    try {
      const hostname = window.location.hostname;
      let subdomain = 'elite-cuts-default';
      const parts = hostname.split('.');
      if (parts.length > 2 && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        subdomain = parts[0];
      }

      const response = await fetch('https://us-central1-elite-cuts-app.cloudfunctions.net/createCheckoutSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tenantId,
          planId,
          subdomain
        })
      });

      if (!response.ok) {
        const errMsg = await response.text();
        throw new Error(errMsg || 'Erreur lors de la création de la session de paiement.');
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('URL de paiement introuvable.');
      }
    } catch (err: any) {
      console.error('Stripe Checkout session initiation failed:', err);
      toast.error(err.message || 'Une erreur est survenue lors de la redirection vers Stripe.');
    } finally {
      setLoadingPlan(null);
    }
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'active':
        return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'trialing':
        return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
      case 'past_due':
        return 'text-orange-400 bg-orange-500/10 border-orange-500/20';
      case 'canceled':
        return 'text-red-400 bg-red-500/10 border-red-500/20';
      default:
        return 'text-white/40 bg-white/5 border-white/10';
    }
  };

  const getStatusLabel = (s: string) => {
    switch (s) {
      case 'active':
        return 'Actif';
      case 'trialing':
        return 'Période d\'essai';
      case 'past_due':
        return 'Paiement en attente';
      case 'canceled':
        return 'Annulé';
      default:
        return s;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white py-16 px-4 relative overflow-hidden flex flex-col justify-center items-center">
      {/* Background blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#D4AF37]/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-4xl relative z-10">
        
        {/* Success Banner */}
        {success && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400 flex items-center gap-4 shadow-lg shadow-green-500/5"
          >
            <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center border border-green-500/30 flex-shrink-0">
              <Check className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg">Abonnement activé ! 🎉</h3>
              <p className="text-sm text-green-400/80">Merci pour votre confiance. Votre salon Barberboard est maintenant entièrement opérationnel.</p>
            </div>
          </motion.div>
        )}

        {/* Expired Trial Banner */}
        {expired && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center gap-4 shadow-lg shadow-orange-500/5"
          >
            <div className="w-12 h-12 rounded-full bg-orange-500/20 flex items-center justify-center border border-orange-500/30 flex-shrink-0">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg">Essai gratuit expiré</h3>
              <p className="text-sm text-orange-400/80">Votre essai gratuit de 15 jours est terminé. Choisissez un plan pour continuer.</p>
            </div>
          </motion.div>
        )}

        {/* Header & Status Card */}
        <div className="mb-12 text-center md:text-left md:flex md:items-center md:justify-between border-b border-[#D4AF37]/10 pb-8">
          <div>
            <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Gestion de l'abonnement</h1>
            <p className="text-white/60 mt-2">Gérez les détails de facturation et les formules de votre salon.</p>
          </div>

          <div className="mt-6 md:mt-0 flex flex-col sm:flex-row gap-4 items-center bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/10 flex items-center justify-center border border-[#D4AF37]/20">
                <CreditCard className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Formule Actuelle</div>
                <div className="text-sm font-bold uppercase">{currentPlan === 'pro' ? 'Pro Plan' : 'Basic Plan'}</div>
              </div>
            </div>

            <div className="w-px h-8 bg-white/10 hidden sm:block" />

            <div className="flex items-center gap-3">
              <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(status)}`}>
                {getStatusLabel(status)}
              </span>
            </div>
          </div>
        </div>

        {/* Trial info badge */}
        {status === 'trialing' && (
          <div className="mb-10 p-5 rounded-2xl bg-blue-500/5 border border-blue-500/20 text-blue-400 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5" />
              <span className="text-sm font-semibold">Période d'essai gratuite en cours</span>
            </div>
            <span className="text-xs font-black bg-blue-500/20 px-3.5 py-1 rounded-full uppercase tracking-wider">
              {daysRemaining} jours restants
            </span>
          </div>
        )}

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8">
          
          {/* Basic Plan Card */}
          <div className={`bg-gradient-to-br from-[#141414] to-[#0d0d0d] border rounded-3xl p-8 flex flex-col justify-between transition-all relative ${
            currentPlan === 'basic' && status === 'active'
              ? 'border-[#D4AF37] shadow-lg shadow-[#D4AF37]/5'
              : 'border-white/5 hover:border-[#D4AF37]/20'
          }`}>
            {currentPlan === 'basic' && status === 'active' && (
              <div className="absolute -top-3 left-6 bg-[#D4AF37] text-black text-[9px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full">
                Plan Actif
              </div>
            )}
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Basic Plan</h3>
                <p className="text-xs text-white/40 mt-1">Idéal pour les barbiers indépendants ou petits salons.</p>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black">29 €</span>
                <span className="text-white/40 text-xs">/mois</span>
              </div>

              <div className="w-full h-px bg-white/5" />

              <ul className="space-y-3.5">
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Maximum 2 collaborateurs (coiffeurs)</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Réservations en ligne illimitées</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Widget de réservation Barberboard</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Support standard par email</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <button
                onClick={() => handleSelectPlan('basic')}
                disabled={loadingPlan !== null || (currentPlan === 'basic' && status === 'active')}
                className={`w-full py-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                  currentPlan === 'basic' && status === 'active'
                    ? 'bg-white/5 border border-white/10 text-white/40 cursor-default'
                    : 'bg-white/5 hover:bg-white/10 border border-white/10 text-white'
                }`}
              >
                {loadingPlan === 'basic' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : currentPlan === 'basic' && status === 'active' ? (
                  'Formule Active'
                ) : (
                  'Choisir ce plan'
                )}
              </button>
            </div>
          </div>

          {/* Pro Plan Card */}
          <div className={`bg-gradient-to-br from-[#141414] to-[#0d0d0d] border rounded-3xl p-8 flex flex-col justify-between transition-all relative ${
            currentPlan === 'pro' && status === 'active'
              ? 'border-[#D4AF37] shadow-lg shadow-[#D4AF37]/5'
              : 'border-[#D4AF37]/30 hover:border-[#D4AF37]'
          }`}>
            <div className="absolute -top-3 right-6 bg-[#D4AF37] text-black text-[9px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full flex items-center gap-1 shadow-lg">
              <Sparkles className="w-3 h-3 fill-current animate-pulse" /> Populaire
            </div>
            
            {currentPlan === 'pro' && status === 'active' && (
              <div className="absolute -top-3 left-6 bg-[#D4AF37] text-black text-[9px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full">
                Plan Actif
              </div>
            )}
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-white">Pro Plan</h3>
                <p className="text-xs text-white/40 mt-1">Parfait pour les salons en pleine croissance et équipes.</p>
              </div>

              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-black text-[#D4AF37]">59 €</span>
                <span className="text-white/40 text-xs">/mois</span>
              </div>

              <div className="w-full h-px bg-white/5" />

              <ul className="space-y-3.5">
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Maximum 8 collaborateurs (coiffeurs)</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Widget de réservation personnalisé</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Notifications SMS automatisées</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Rapports et analyses financières</span>
                </li>
                <li className="flex items-center gap-2.5 text-sm text-white/60">
                  <Check className="w-4 h-4 text-[#D4AF37]" />
                  <span>Support prioritaire 24/7</span>
                </li>
              </ul>
            </div>

            <div className="pt-8">
              <button
                onClick={() => handleSelectPlan('pro')}
                disabled={loadingPlan !== null || (currentPlan === 'pro' && status === 'active')}
                className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
                  currentPlan === 'pro' && status === 'active'
                    ? 'bg-white/5 border border-white/10 text-white/40 cursor-default'
                    : 'bg-[#D4AF37] text-black hover:bg-[#FFD700] hover:shadow-lg hover:shadow-[#D4AF37]/10'
                }`}
              >
                {loadingPlan === 'pro' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : currentPlan === 'pro' && status === 'active' ? (
                  'Formule Active'
                ) : (
                  'Choisir ce plan'
                )}
              </button>
            </div>
          </div>

        </div>

        {/* Security Warning Section if payment past due / canceled */}
        {(status === 'past_due' || status === 'canceled') && (
          <div className="mt-12 p-6 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-400 flex items-start gap-4">
            <ShieldAlert className="w-6 h-6 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-extrabold text-sm uppercase tracking-wider">Abonnement non régularisé</h4>
              <p className="text-xs text-white/60 mt-1.5 leading-relaxed">
                Votre accès au tableau de bord d'administration est temporairement limité car votre abonnement Stripe a expiré ou est en retard de paiement. Veuillez sélectionner l'une des formules ci-dessus pour restaurer immédiatement tous vos services.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
