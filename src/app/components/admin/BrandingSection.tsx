import { useState } from 'react';
import { motion } from 'motion/react';
import { ImageIcon, Save, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

export const BrandingSection = ({ businessInfo, updateBusinessInfo, handleImageUpload }: any) => {
  const [formData, setFormData] = useState(businessInfo);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateBusinessInfo(formData);
      toast.success("Design mis à jour !");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = await handleImageUpload(file);
      setFormData({ ...formData, logo: url });
    }
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = await handleImageUpload(file);
      setFormData({ ...formData, heroImage: url });
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <form onSubmit={handleSubmit} className="space-y-8">
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
                  <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <ImageIcon className="w-8 h-8 mb-2" />
                    <span className="text-sm font-bold">Changer l'image</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleHeroUpload} />
                  </label>
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
                  {formData.logo ? (
                    <img src={formData.logo} className="w-full h-full object-contain p-4" />
                  ) : (
                    <ImageIcon className="w-8 h-8 text-white/20" />
                  )}
                  <label className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    <span className="text-[10px] font-bold">Upload</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                  </label>
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

        <button 
          type="submit" 
          disabled={isSaving}
          className="flex items-center gap-2 px-8 py-4 bg-[#D4AF37] text-black font-bold rounded-2xl hover:scale-105 transition-all shadow-xl shadow-[#D4AF37]/20"
        >
          {isSaving ? <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" /> : <Save className="w-5 h-5" />}
          Enregistrer les modifications
        </button>
      </form>
    </div>
  );
};
