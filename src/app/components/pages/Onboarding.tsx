import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Scissors, Check, ArrowRight, ArrowLeft, Loader2, Sparkles, UserPlus, FilePlus, CalendarRange } from 'lucide-react';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useTenant } from '../context/TenantContext';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { useAuth } from '../context/AuthContext';

const DAYS_OF_WEEK = [
  { key: 'lundi', label: 'Lundi' },
  { key: 'mardi', label: 'Mardi' },
  { key: 'mercredi', label: 'Mercredi' },
  { key: 'jeudi', label: 'Jeudi' },
  { key: 'vendredi', label: 'Vendredi' },
  { key: 'samedi', label: 'Samedi' },
  { key: 'dimanche', label: 'Dimanche' }
];

interface DayConfig {
  active: boolean;
  start: string;
  end: string;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { tenantId: urlTenantId } = useTenant();
  const { user, isLoading: authLoading } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Resolve the correct tenant ID — always prefer the auth user's tenantId
  // because the URL may still be on barberboard.pro (urlTenantId = 'platform')
  const activeTenantId = (user?.tenantId && user.tenantId !== 'platform') 
    ? user.tenantId 
    : urlTenantId;

  // True if we are still waiting for the auth context to resolve a real tenantId
  const isResolvingTenant = authLoading || !activeTenantId || activeTenantId === 'platform';

  useEffect(() => {
    // Never redirect while auth is still loading
    if (authLoading) return;
    if (user?.role === 'superadmin') {
      navigate('/superadmin', { replace: true });
    } else if (user?.role === 'admin') {
      navigate('/admin', { replace: true });
    } else if (user?.role === 'barber') {
      navigate('/barber', { replace: true });
    } else if (user?.role === 'client') {
      navigate('/client', { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    getAuth().currentUser?.getIdToken(true);
  }, []);

  // Step 1: Barber
  const [barberName, setBarberName] = useState('');
  const [barberSpecialty, setBarberSpecialty] = useState('');

  // Step 2: Service
  const [serviceName, setServiceName] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceDuration, setServiceDuration] = useState('30');
  const [serviceCategory, setServiceCategory] = useState('Coupe');

  // Step 3: Opening Hours
  const [weeklyHours, setWeeklyHours] = useState<Record<string, DayConfig>>({
    lundi: { active: true, start: '09:00', end: '19:00' },
    mardi: { active: true, start: '09:00', end: '19:00' },
    mercredi: { active: true, start: '09:00', end: '19:00' },
    jeudi: { active: true, start: '09:00', end: '19:00' },
    vendredi: { active: true, start: '09:00', end: '19:00' },
    samedi: { active: false, start: '10:00', end: '18:00' },
    dimanche: { active: false, start: '10:00', end: '17:00' }
  });

  const handleDayToggle = (day: string) => {
    setWeeklyHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        active: !prev[day].active
      }
    }));
  };

  const handleTimeChange = (day: string, field: 'start' | 'end', val: string) => {
    setWeeklyHours(prev => ({
      ...prev,
      [day]: {
        ...prev[day],
        [field]: val
      }
    }));
  };

  const handleNext = async () => {
    setLoading(true);
    try {
      if (step === 1) {
        if (barberName.trim()) {
          // Save barber to DB
          await addDoc(collection(db, 'barbers'), {
            name: barberName.trim(),
            specialty: barberSpecialty.trim() || 'Coiffeur',
            experience: 'Coiffeur qualifié',
            rating: '5.0',
            image: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&h=400&fit=crop',
            archived: false,
            tenantId: activeTenantId
          });
          toast.success('Premier collaborateur ajouté !');
        }
        setStep(2);
      } else if (step === 2) {
        if (serviceName.trim()) {
          // Save service to DB
          const formattedPrice = servicePrice.includes('€') ? servicePrice.trim() : `${servicePrice.trim()} €`;
          await addDoc(collection(db, 'services'), {
            name: serviceName.trim(),
            price: formattedPrice,
            duration: `${serviceDuration} min`,
            category: serviceCategory,
            description: 'Soin classique configuré lors de l\'inscription.',
            image: 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=450&fit=crop',
            tenantId: activeTenantId
          });
          toast.success('Premier service configuré !');
        }
        setStep(3);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Erreur lors de la sauvegarde : ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      if (!activeTenantId || activeTenantId === 'platform') {
        throw new Error("Impossible de déterminer votre salon. Veuillez recharger la page.");
      }
      
      const tenantRef = doc(db, 'tenants', activeTenantId);
      
      // Update weeklyHours and mark onboardingComplete to true
      await updateDoc(tenantRef, {
        'settings.weeklyHours': weeklyHours,
        onboardingComplete: true
      });

      toast.success('Configuration finale enregistrée !');
      setStep(4); // Move to the success screen
    } catch (err: any) {
      console.error(err);
      toast.error('Erreur de configuration finale : ' + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Show a loading screen while we wait for the real tenantId to be resolved.
  // This prevents the user from submitting forms with tenantId = 'platform'.
  if (isResolvingTenant) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 rounded-full border-4 border-white/10"></div>
          <div className="absolute inset-0 rounded-full border-4 border-t-[#D4AF37] animate-spin"></div>
        </div>
        <p className="mt-6 text-sm uppercase tracking-widest text-white/50 animate-pulse font-medium">
          Chargement de votre espace...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center py-8 px-4 relative overflow-hidden text-white">
      {/* Background decoration */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-[#D4AF37]/10 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[50%] bg-[#D4AF37]/5 rounded-full blur-[120px]" />

      <div className="w-full max-w-2xl bg-gradient-to-br from-[#141414] to-[#0a0a0a] border border-[#D4AF37]/20 rounded-3xl p-4 md:p-8 shadow-2xl relative z-10 backdrop-blur-md">
        
        {/* Progress Bar (Only visible steps 1 to 3) */}
        {step < 4 && (
          <div className="mb-10">
            <div className="flex justify-between items-center text-xs font-bold text-white/40 uppercase tracking-widest mb-3">
              <span>Étape {step} sur 3</span>
              <span>{step === 1 ? 'Collaborateur' : step === 2 ? 'Service' : 'Horaires'}</span>
            </div>
            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-[#D4AF37]"
                initial={{ width: '33.33%' }}
                animate={{ width: `${(step / 3) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        <div className="min-h-[300px] flex flex-col justify-between">
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
                  <UserPlus className="w-6 h-6 text-[#D4AF37]" />
                  <div>
                    <h2 className="text-xl font-bold">Votre premier coiffeur</h2>
                    <p className="text-xs text-white/40 mt-0.5">Ajoutez-vous ou ajoutez votre premier collaborateur.</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Nom du coiffeur</label>
                  <input
                    type="text"
                    value={barberName}
                    onChange={(e) => setBarberName(e.target.value)}
                    placeholder="Ex: Karim Barber"
                    className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Spécialité</label>
                  <input
                    type="text"
                    value={barberSpecialty}
                    onChange={(e) => setBarberSpecialty(e.target.value)}
                    placeholder="Ex: Coupe Dégradé, Barbe et Rasage"
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
                  <FilePlus className="w-6 h-6 text-[#D4AF37]" />
                  <div>
                    <h2 className="text-xl font-bold">Votre premier service</h2>
                    <p className="text-xs text-white/40 mt-0.5">Configurez une première prestation disponible à la réservation.</p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Nom de la prestation</label>
                    <input
                      type="text"
                      value={serviceName}
                      onChange={(e) => setServiceName(e.target.value)}
                      placeholder="Ex: Coupe Homme"
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Tarif (€)</label>
                    <input
                      type="number"
                      value={servicePrice}
                      onChange={(e) => setServicePrice(e.target.value)}
                      placeholder="Ex: 25"
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all placeholder:text-white/20"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Durée</label>
                    <select
                      value={serviceDuration}
                      onChange={(e) => setServiceDuration(e.target.value)}
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all appearance-none"
                    >
                      <option className="bg-[#141414]" value="15">15 min</option>
                      <option className="bg-[#141414]" value="30">30 min</option>
                      <option className="bg-[#141414]" value="45">45 min</option>
                      <option className="bg-[#141414]" value="60">60 min</option>
                      <option className="bg-[#141414]" value="90">90 min</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold uppercase text-white/60 tracking-wider">Catégorie</label>
                    <select
                      value={serviceCategory}
                      onChange={(e) => setServiceCategory(e.target.value)}
                      className="px-5 py-4 bg-white/5 border border-white/10 rounded-xl focus:border-[#D4AF37] outline-none text-white transition-all appearance-none"
                    >
                      <option className="bg-[#141414]" value="Coupe">Coupe</option>
                      <option className="bg-[#141414]" value="Barbe">Barbe</option>
                      <option className="bg-[#141414]" value="Coloration">Coloration</option>
                      <option className="bg-[#141414]" value="Soin">Soin</option>
                    </select>
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
                  <CalendarRange className="w-6 h-6 text-[#D4AF37]" />
                  <div>
                    <h2 className="text-xl font-bold">Vos horaires d'ouverture</h2>
                    <p className="text-xs text-white/40 mt-0.5">Activez les jours d'ouverture et configurez les heures.</p>
                  </div>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {DAYS_OF_WEEK.map(({ key, label }) => {
                    const dayConf = weeklyHours[key];
                    return (
                      <div key={key} className="flex flex-wrap gap-2 items-center p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={dayConf.active}
                            onChange={() => handleDayToggle(key)}
                            className="w-5 h-5 rounded accent-[#D4AF37] border-white/10 bg-black"
                          />
                          <span className="text-sm font-bold">{label}</span>
                        </div>
                        {dayConf.active ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                            <input
                              type="text"
                              value={dayConf.start}
                              onChange={(e) => handleTimeChange(key, 'start', e.target.value)}
                              placeholder="09:00"
                              className="w-20 min-w-0 flex-1 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-center font-mono text-xs text-white focus:border-[#D4AF37] outline-none"
                            />
                            <span className="text-white/40 text-xs">-</span>
                            <input
                              type="text"
                              value={dayConf.end}
                              onChange={(e) => handleTimeChange(key, 'end', e.target.value)}
                              placeholder="19:00"
                              className="w-20 min-w-0 flex-1 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-center font-mono text-xs text-white focus:border-[#D4AF37] outline-none"
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-white/20 font-bold uppercase tracking-wider">Fermé</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {step === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center text-center space-y-6 py-8"
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#FFD700]/20 flex items-center justify-center border border-[#D4AF37]/30 mb-2">
                  <Sparkles className="w-10 h-10 text-[#D4AF37] animate-bounce" />
                </div>
                <h2 className="text-3xl font-black bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Votre salon est prêt ! 🎉</h2>
                <p className="text-sm text-white/60 max-w-sm leading-relaxed">
                  Votre espace a été configuré avec succès. Vous pouvez maintenant accéder à votre tableau de bord d'administration pour gérer les réservations, les collaborateurs et vos services.
                </p>
                <button
                  onClick={() => navigate(`/${user?.role || 'admin'}`, { replace: true })}
                  className="px-10 py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-2xl font-black text-sm hover:shadow-xl hover:shadow-[#D4AF37]/30 transition-all uppercase tracking-widest active:scale-95"
                >
                  Accéder au tableau de bord
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation Controls */}
          {step < 4 && (
            <div className="flex justify-between items-center border-t border-[#D4AF37]/10 pt-6 mt-8">
              <div>
                {step > 1 && (
                  <button
                    onClick={() => setStep(prev => prev - 1)}
                    disabled={loading}
                    className="px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all text-xs font-bold flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Retour
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {step < 3 ? (
                  <>
                    <button
                      onClick={() => setStep(prev => prev + 1)}
                      disabled={loading}
                      className="px-5 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 rounded-xl transition-all text-xs font-bold"
                    >
                      Passer cette étape
                    </button>
                    <button
                      onClick={handleNext}
                      disabled={loading}
                      className="px-6 py-3.5 bg-[#D4AF37] text-black rounded-xl hover:bg-[#FFD700] transition-all font-bold flex items-center gap-1 text-xs active:scale-95 disabled:opacity-40"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Continuer'} <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={handleFinalSubmit}
                    disabled={loading}
                    className="px-8 py-3.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all font-bold flex items-center gap-1.5 text-xs active:scale-95 disabled:opacity-40"
                  >
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Terminer la configuration'} <Check className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
