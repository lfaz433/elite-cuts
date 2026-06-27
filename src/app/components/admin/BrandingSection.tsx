import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ImageIcon, Save, Plus, X, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export const BrandingSection = ({ businessInfo, updateBusinessInfo, handleImageUpload }: any) => {
  const [formData, setFormData] = useState(businessInfo);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const [logoUploadSuccess, setLogoUploadSuccess] = useState(false);
  const [heroUploadSuccess, setHeroUploadSuccess] = useState(false);

  useEffect(() => {
    if (businessInfo) {
      setFormData(businessInfo);
    }
  }, [businessInfo]);

  const currentStats = formData.stats || [
    { id: 'experience', label: "Années d'expérience", value: '15+', enabled: true },
    { id: 'clients', label: 'Clients Satisfaits', value: '10K+', enabled: true },
    { id: 'services', label: 'Services Réalisés', value: '50K+', enabled: true },
    { id: 'rating', label: 'Note des Clients', value: '4.9', enabled: true },
  ];

  const handleStatChange = (id: string, field: 'label' | 'value' | 'enabled', value: any) => {
    const updatedStats = currentStats.map((s: any) => s.id === id ? { ...s, [field]: value } : s);
    setFormData({ ...formData, stats: updatedStats });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateBusinessInfo(formData);
      toast.success("Design mis à jour !");
    } catch (err: any) {
      console.error('Error updating design/branding:', err);
      toast.error("Erreur lors de la mise à jour du design : " + (err?.message || err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadingLogo(true);
    setLogoUploadSuccess(false);
    
    if (file.size > 5 * 1024 * 1024) {
      toast.warning("Image volumineuse détectée. Compression en cours...");
    }
    
    try {
      // Logo: 400px max, high quality
      const url = await handleImageUpload(file, 400, 0.8);
      setFormData({ ...formData, logo: url });
      setLogoUploadSuccess(true);
      toast.success("Logo uploadé avec succès !");
      setTimeout(() => setLogoUploadSuccess(false), 3000);
    } catch (err: any) {
      console.error('Logo upload error:', err);
      toast.error(err?.message || "Erreur lors de l'upload du logo. Essayez une image plus petite.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploadingHero(true);
    setHeroUploadSuccess(false);
    
    if (file.size > 5 * 1024 * 1024) {
      toast.warning("Image volumineuse détectée. Compression en cours...");
    }
    
    try {
      // Hero: 1200px max, good quality for full-width display
      const url = await handleImageUpload(file, 1200, 0.7);
      setFormData({ ...formData, heroImage: url });
      setHeroUploadSuccess(true);
      toast.success("Image hero uploadée avec succès !");
      setTimeout(() => setHeroUploadSuccess(false), 3000);
    } catch (err: any) {
      console.error('Hero upload error:', err);
      toast.error(err?.message || "Erreur lors de l'upload de l'image hero. Essayez une image plus petite.");
    } finally {
      setIsUploadingHero(false);
    }
  };

  const isUploading = isUploadingLogo || isUploadingHero;

  return (
    <div className="space-y-8 max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Salon Name */}
        <div className="bg-[#141414] p-6 rounded-3xl border border-[#D4AF37]/10">
          <h3 className="font-bold text-lg mb-4">Nom du Salon</h3>
          <div>
            <label className="block text-white/40 text-sm mb-2">Nom affiché sur la page d'accueil</label>
            <input 
              value={formData.name || ''} 
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold text-lg" 
              placeholder="Ex: Elite Cuts Barbershop"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Hero Section */}
          <div className="space-y-4 bg-[#141414] p-6 rounded-3xl border border-[#D4AF37]/10">
            <h3 className="font-bold text-lg mb-4">Hero Section</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/40 text-sm mb-2">Titre Principal</label>
                <input 
                  value={formData.heroTitle} 
                  onChange={(e) => setFormData({ ...formData, heroTitle: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37]" 
                />
              </div>
              <div>
                <label className="block text-white/40 text-sm mb-2">Sous-titre</label>
                <textarea 
                  value={formData.heroSubtitle} 
                  onChange={(e) => setFormData({ ...formData, heroSubtitle: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] h-24" 
                />
              </div>
              <div>
                <label className="block text-white/40 text-sm mb-2">Image Hero</label>
                <div className="relative aspect-video rounded-xl overflow-hidden bg-white/5 group border border-dashed border-white/20">
                  <img src={formData.heroImage} className="w-full h-full object-cover" />
                  
                  {/* Upload overlay */}
                  {isUploadingHero ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70">
                      <Loader2 className="w-10 h-10 text-[#D4AF37] animate-spin mb-2" />
                      <span className="text-sm font-bold text-white/80">Compression en cours...</span>
                    </div>
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <ImageIcon className="w-8 h-8 mb-2" />
                      <span className="text-sm font-bold">Changer l'image</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleHeroUpload} />
                    </label>
                  )}
                  
                  {/* Success badge */}
                  {heroUploadSuccess && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-emerald-500/90 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
                      <CheckCircle className="w-4 h-4" />
                      Uploadé !
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Logo & Identity */}
          <div className="space-y-4 bg-[#141414] p-6 rounded-3xl border border-[#D4AF37]/10">
            <h3 className="font-bold text-lg mb-4">Identité</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-white/40 text-sm mb-2">Logo du Salon</label>
                <div className="relative w-32 h-32 rounded-2xl overflow-hidden bg-white/5 group border border-dashed border-white/20 flex items-center justify-center">
                  {isUploadingLogo ? (
                    <div className="flex flex-col items-center justify-center">
                      <Loader2 className="w-8 h-8 text-[#D4AF37] animate-spin" />
                      <span className="text-[9px] mt-1 text-white/50">Upload...</span>
                    </div>
                  ) : formData.logo ? (
                    <img src={formData.logo} className="w-full h-full object-contain p-4" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-white/20" />
                  )}
                  
                  {!isUploadingLogo && (
                    <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <span className="text-[10px] font-bold">Upload</span>
                      <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                    </label>
                  )}
                  
                  {/* Success badge */}
                  {logoUploadSuccess && (
                    <div className="absolute -top-1 -right-1 bg-emerald-500 text-white rounded-full p-1">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-white/40 text-sm mb-2">Texte du Bouton Hero</label>
                <input 
                  value={formData.heroButtonText} 
                  onChange={(e) => setFormData({ ...formData, heroButtonText: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37]" 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Global Stats Editor */}
        <div className="space-y-4 bg-[#141414] p-6 rounded-3xl border border-[#D4AF37]/10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">Statistiques (Landing Page)</h3>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, showStatsSection: formData.showStatsSection === false ? true : false })}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${formData.showStatsSection !== false ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white/40'}`}
            >
              {formData.showStatsSection !== false ? 'Section Activée' : 'Section Désactivée'}
            </button>
          </div>
          
          <div className={`space-y-4 ${formData.showStatsSection === false ? 'opacity-50 pointer-events-none' : ''}`}>
            {currentStats.map((stat: any) => (
              <div key={stat.id} className="flex flex-col md:flex-row items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5">
                <button
                  type="button"
                  onClick={() => handleStatChange(stat.id, 'enabled', !stat.enabled)}
                  className={`p-3 rounded-xl transition-colors ${stat.enabled ? 'bg-[#D4AF37]/20 text-[#D4AF37]' : 'bg-red-500/20 text-red-500'}`}
                  title={stat.enabled ? 'Désactiver cette stat' : 'Activer cette stat'}
                >
                  {stat.enabled ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                </button>
                <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Valeur</label>
                    <input 
                      value={stat.value} 
                      onChange={(e) => handleStatChange(stat.id, 'value', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37] font-bold" 
                      placeholder="Ex: 15+"
                    />
                  </div>
                  <div>
                    <label className="block text-white/30 text-[10px] font-black uppercase tracking-widest mb-2">Label</label>
                    <input 
                      value={stat.label} 
                      onChange={(e) => handleStatChange(stat.id, 'label', e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-[#D4AF37]" 
                      placeholder="Ex: Années d'expérience"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button 
          type="submit" 
          disabled={isSaving || isUploading}
          className="flex items-center gap-2 px-8 py-4 bg-[#D4AF37] text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-xl shadow-[#D4AF37]/20 disabled:opacity-50 disabled:hover:scale-100"
        >
          {isSaving ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
          {isUploading ? "Upload en cours..." : isSaving ? "Enregistrement..." : "Enregistrer les modifications"}
        </button>
      </form>
    </div>
  );
};
