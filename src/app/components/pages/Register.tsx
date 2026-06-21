import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Check, AlertTriangle, ArrowRight, ArrowLeft, Loader2, Sparkles, Shield, User, Globe, Store } from 'lucide-react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { auth, db, functions } from '../../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

import { validateSubdomain } from '../../lib/validators';

type PlanId = 'basic' | 'pro' | 'enterprise';

interface Plan {
  id: PlanId;
  name: string;
  price: string;
  barbers: string;
  limit: number;
  features: string[];
  recommended?: boolean;
}

const PLANS: Plan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: '29',
    barbers: 'Jusqu\'à 2 coiffeurs',
    limit: 2,
    features: ['Réservations illimitées', 'Support par email', 'Widget de réservation de base']
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '59',
    barbers: 'Jusqu\'à 8 coiffeurs',
    limit: 8,
    features: ['Notifications SMS', 'Statistiques détaillées', 'Branding personnalisé', 'Support prioritaire'],
    recommended: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '99',
    barbers: 'Coiffeurs illimités',
    limit: 999,
    features: ['Rapports multi-salons', 'API d\'intégration', 'Accompagnement dédié', 'SLA à 99.9%']
  }
];

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Form states
  const [shopName, setShopName] = useState('');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');

  const [subdomain, setSubdomain] = useState('');
  const [isCheckingSubdomain, setIsCheckingSubdomain] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const [subdomainError, setSubdomainError] = useState('');

  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');

  const [selectedPlan, setSelectedPlan] = useState<PlanId>('pro');

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleSubdomainChange = (val: string) => {
    const slug = slugify(val);
    setSubdomain(slug);
    setSubdomainAvailable(null);
    setSubdomainError('');
  };

  const checkSubdomain = async () => {
    const validationError = validateSubdomain(subdomain);
    if (validationError) {
      setSubdomainError(validationError);
      return;
    }

    setIsCheckingSubdomain(true);
    setSubdomainError('');
    try {
      const q = query(collection(db, 'tenants'), where('subdomain', '==', subdomain));
      const querySnapshot = await getDocs(q);
      const isTaken = !querySnapshot.empty;
      setSubdomainAvailable(!isTaken);
      if (isTaken) {
        setSubdomainError('Ce sous-domaine est déjà utilisé.');
      }
    } catch (err) {
      console.error(err);
      setSubdomainError('Erreur lors de la vérification de disponibilité.');
    } finally {
      setIsCheckingSubdomain(false);
    }
  };

  const validateStep = () => {
    if (step === 1) {
      if (!shopName.trim()) {
        toast.error('Veuillez entrer le nom de votre salon.');
        return false;
      }
      if (!shopPhone.trim()) {
        toast.error('Veuillez entrer le numéro de téléphone.');
        return false;
      }
    }
    if (step === 2) {
      if (!subdomain) {
        toast.error('Veuillez choisir un sous-domaine.');
        return false;
      }
      if (subdomainAvailable !== true) {
        toast.error('Veuillez valider la disponibilité de votre sous-domaine.');
        return false;
      }
    }
    if (step === 3) {
      if (!ownerName.trim()) {
        toast.error('Veuillez entrer votre nom complet.');
        return false;
      }
      if (!ownerEmail.trim()) {
        toast.error('Veuillez entrer votre adresse email.');
        return false;
      }
      if (ownerPassword.length < 6) {
        toast.error('Votre mot de passe doit comporter au moins 6 caractères.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep()) {
      setStep(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    setStep(prev => Math.max(1, prev - 1));
  };

  const handleSubmit = async () => {
    setLoading(true);
    let createdUser: any = null;
    let provisionStatus = 'pending';
    let isVercelVerified = false;

    try {
      // 1. Generate unique Tenant Doc ID
      const newTenantId = doc(collection(db, 'tenants')).id;

      // 2. Create Firebase Auth user
      const cleanEmail = ownerEmail.trim().toLowerCase();
      const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, ownerPassword);
      createdUser = userCredential.user;

      // 3. Update displayName in Firebase Auth profile
      await updateProfile(createdUser, { displayName: ownerName });

      // 4. Write user document to Firestore FIRST — this must happen before any other
      //    Firestore write, because Security Rules use getUserData() to verify identity.
      const userProfile = {
        uid: createdUser.uid,
        email: cleanEmail,
        name: ownerName,
        role: 'admin',
        tenantId: newTenantId,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'users', createdUser.uid), userProfile);

      // 5. Reserve subdomain — now safe because user doc exists
      try {
        await setDoc(doc(db, 'subdomains', subdomain), {
          ownerUid: createdUser.uid,
          tenantId: newTenantId,
          createdAt: new Date().toISOString()
        });
      } catch (subErr) {
        // Non-fatal: log but do not abort the entire registration
        console.warn('Subdomain reservation failed (non-fatal):', subErr);
      }

      // 6. Write tenant document — user doc is now in Firestore so isMemberOfTenant() will pass
      const tenantData = {
        subdomain,
        domain: {
          subdomain,
          status: provisionStatus,
          vercelVerified: isVercelVerified
        },
        name: shopName,
        ownerUid: createdUser.uid,
        subscription: {
          status: 'trialing',
          planId: selectedPlan,
          trialEndsAt: Date.now() + 15 * 24 * 60 * 60 * 1000
        },
        branding: {
          primaryColor: '#D4AF37',
          logoUrl: '',
          businessName: shopName
        },
        settings: {
          maxBarbersLimit: selectedPlan === 'basic' ? 2 : selectedPlan === 'pro' ? 8 : 999,
          allowOnlineBooking: true
        },
        createdAt: Date.now()
      };
      await setDoc(doc(db, 'tenants', newTenantId), tenantData);

      // 7. Force token refresh so downstream calls have fresh claims
      await auth.currentUser?.getIdToken(true);

      // 8. Call Vercel Provisioning API (non-fatal if it fails)
      try {
        const idToken = await createdUser.getIdToken();
        const res = await fetch('/api/provision-subdomain', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({ subdomain, tenantId: newTenantId })
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          provisionStatus = 'active';
          isVercelVerified = data.verified;
        } else {
          provisionStatus = 'failed';
          console.error("Provisioning failed:", data.error || data);
        }
      } catch (e) {
        console.error("Failed to reach provisioning endpoint:", e);
        provisionStatus = 'failed';
      }

      if (provisionStatus === 'failed') {
        toast.warning("Salon créé, mais la configuration du domaine a échoué. Vous pourrez réessayer depuis les paramètres.");
      } else {
        toast.success('Votre salon a été configuré avec succès !');
      }
      
      navigate('/onboarding');

    } catch (err: any) {
      console.error('Registration failure:', err);
      toast.error(err.message || 'Une erreur est survenue lors de la création.');

      // Rollback Auth user if database insertions failed
      if (createdUser) {
        try {
          await createdUser.delete();
        } catch (delErr) {
          console.error('Failed to cleanup orphan user:', delErr);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center py-16 px-4 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#D4AF37]/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-4xl bg-gradient-to-br from-[#141414] to-[#0a0a0a] border border-[#D4AF37]/20 rounded-3xl p-8 md:p-12 shadow-2xl relative z-10 backdrop-blur-md">
        {/* Back Button */}
        <button
          onClick={() => {
            if (step === 1) {
              navigate('/');
            } else {
              setStep(prev => Math.max(1, prev - 1));
            }
          }}
          className="absolute top-6 left-8 flex items-center gap-1.5 text-xs text-white/40 hover:text-white transition-colors"
        >
          {step === 1 ? "← Retour à l'accueil" : "← Retour"}
        </button>
        
        {/* Header */}
        <div className="flex flex-col items-center mb-10 text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center border border-[#D4AF37]/30 mb-4">
            <Scissors className="w-8 h-8 text-[#D4AF37] animate-pulse" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent mb-2">Rejoignez Barberboard</h1>
          <p className="text-white/60">Configurez votre salon multi-utilisateur en quelques minutes.</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-12">
          <div className="flex justify-between items-center text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
            <span>Étape {step} sur 4</span>
            <span>{step === 1 ? 'Salon' : step === 2 ? 'Lien' : step === 3 ? 'Compte' : 'Formule'}</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gradient-to-r from-[#D4AF37] to-[#FFD700]"
              initial={{ width: '0%' }}
              animate={{ width: `${(step / 4) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Form Wizard Pages */}
        <div className="min-h-[300px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 border-b border-[#D4AF37]/10 pb-4 mb-6">
                  <Store className="w-6 h-6 text-[#D4AF37]" />
                  <h2 className="text-xl font-bold text-white">Détails de votre salon</h2>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Nom du salon *</label>
                    <input
                      type="text"
                      value={shopName}
                      onChange={(e) => setShopName(e.target.value)}
                      placeholder="Ex: Barber Studio"
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Téléphone *</label>
                    <PhoneInput
                      country={'fr'}
                      preferredCountries={['fr', 'dz', 'ma', 'tn', 'sa', 'ae', 'qa', 'kw', 'bh', 'jo', 'be', 'ch', 'gb']}
                      value={shopPhone}
                      onChange={(value) => setShopPhone('+' + value)}
                      inputStyle={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        color: 'white',
                        height: '48px',
                        fontSize: '14px',
                        paddingLeft: '58px',
                      }}
                      buttonStyle={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px 0 0 12px',
                      }}
                      dropdownStyle={{
                        background: '#1a1a1a',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                      }}
                      searchStyle={{
                        background: '#1a1a1a',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.1)',
                      }}
                      enableSearch={true}
                      searchPlaceholder="Rechercher un pays..."
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Adresse (Optionnel)</label>
                  <input
                    type="text"
                    value={shopAddress}
                    onChange={(e) => setShopAddress(e.target.value)}
                    placeholder="Ex: 12 Rue de la Paix, Paris"
                    className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                  />
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 border-b border-[#D4AF37]/10 pb-4 mb-6">
                  <Globe className="w-6 h-6 text-[#D4AF37]" />
                  <h2 className="text-xl font-bold text-white">Choisissez votre adresse web</h2>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Sous-domaine personnalisé *</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={subdomain}
                      onChange={(e) => handleSubdomainChange(e.target.value)}
                      onBlur={checkSubdomain}
                      placeholder="mon-salon"
                      className="flex-1 px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20 text-right font-mono"
                    />
                    <div className="px-5 py-4 sm:py-0 bg-white/10 border border-white/10 rounded-xl flex items-center justify-center text-white/60 font-mono text-xs sm:text-sm">
                      .barberboard.pro
                    </div>
                  </div>

                  {subdomain && (
                    <p className="text-xs text-white/40 mt-1 font-mono">
                      Aperçu : <span className="text-[#D4AF37]">{subdomain}.barberboard.pro</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={checkSubdomain}
                    disabled={isCheckingSubdomain || !subdomain}
                    className="px-6 py-3 bg-white/5 border border-[#D4AF37]/30 text-white rounded-xl hover:bg-[#D4AF37]/10 transition-colors flex items-center gap-2 text-sm font-bold disabled:opacity-40"
                  >
                    {isCheckingSubdomain ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Vérification...
                      </>
                    ) : (
                      'Vérifier la disponibilité'
                    )}
                  </button>

                  <div className="flex items-center gap-2">
                    {subdomainAvailable === true && (
                      <span className="text-green-500 flex items-center gap-1 text-sm font-bold">
                        <Check className="w-4 h-4" /> Disponible
                      </span>
                    )}
                    {subdomainError && (
                      <span className="text-red-500 flex items-center gap-1 text-sm font-bold">
                        <AlertTriangle className="w-4 h-4" /> {subdomainError}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 border-b border-[#D4AF37]/10 pb-4 mb-6">
                  <User className="w-6 h-6 text-[#D4AF37]" />
                  <h2 className="text-xl font-bold text-white">Création du compte administrateur</h2>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Nom complet *</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Ex: Karim Dupont"
                    className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Email professionnel *</label>
                    <input
                      type="email"
                      value={ownerEmail}
                      onChange={(e) => setOwnerEmail(e.target.value)}
                      placeholder="Ex: karim@dupont.com"
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Mot de passe *</label>
                    <input
                      type="password"
                      value={ownerPassword}
                      onChange={(e) => setOwnerPassword(e.target.value)}
                      placeholder="Min. 6 caractères"
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                    />
                  </div>
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center gap-3 border-b border-[#D4AF37]/10 pb-4 mb-6">
                  <Shield className="w-6 h-6 text-[#D4AF37]" />
                  <h2 className="text-xl font-bold text-white">Sélectionnez votre formule d'abonnement</h2>
                </div>

                <div className="grid md:grid-cols-3 gap-6 pt-2">
                  {PLANS.map((plan) => (
                    <div
                      key={plan.id}
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`cursor-pointer group relative bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-2xl p-6 border transition-all flex flex-col justify-between ${
                        selectedPlan === plan.id 
                          ? 'border-[#D4AF37] shadow-lg shadow-[#D4AF37]/10 scale-105' 
                          : 'border-white/5 hover:border-[#D4AF37]/30'
                      }`}
                    >
                      {plan.recommended && (
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-[#D4AF37] text-black text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full flex items-center gap-1 shadow-lg">
                          <Sparkles className="w-3 h-3 fill-current" /> Recommandé
                        </div>
                      )}

                      <div className="space-y-4">
                        <div>
                          <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                          <p className="text-xs text-white/40">{plan.barbers}</p>
                        </div>

                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-black text-white">€{plan.price}</span>
                          <span className="text-xs text-white/40">/mois</span>
                        </div>

                        <div className="w-full h-px bg-white/5" />

                        <ul className="space-y-2">
                          {plan.features.map((feature, i) => (
                            <li key={i} className="text-xs text-white/60 flex items-center gap-2">
                              <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="pt-6">
                        <div className={`w-full py-2.5 rounded-xl text-center text-xs font-bold transition-colors ${
                          selectedPlan === plan.id 
                            ? 'bg-[#D4AF37] text-black' 
                            : 'bg-white/5 text-white/60 group-hover:bg-white/10'
                        }`}>
                          Sélectionner
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation Buttons */}
        <div className="flex flex-col-reverse sm:flex-row justify-between items-center gap-3 border-t border-[#D4AF37]/10 pt-8 mt-10">
          {step > 1 ? (
            <button
              onClick={handlePrev}
              disabled={loading}
              className="px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl transition-all font-bold flex items-center gap-2 text-sm disabled:opacity-40"
            >
              <ArrowLeft className="w-4 h-4" /> Retour
            </button>
          ) : (
            <div />
          )}

          {step < 4 ? (
            <button
              onClick={handleNext}
              disabled={step === 2 && subdomainAvailable !== true}
              className="px-8 py-4 bg-[#D4AF37] text-black rounded-2xl hover:bg-[#FFD700] hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all font-bold flex items-center gap-2 text-sm active:scale-95 disabled:opacity-40"
            >
              Continuer <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-10 py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-2xl hover:shadow-xl hover:shadow-[#D4AF37]/30 transition-all font-black text-sm active:scale-95 flex items-center gap-2 disabled:opacity-40"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Création en cours...
                </>
              ) : (
                <>
                  Créer mon Salon <Sparkles className="w-5 h-5 fill-current" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
