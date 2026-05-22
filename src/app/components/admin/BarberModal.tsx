import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Barber, Service } from '../context/BusinessContext';

const BarberModal = ({ 
  barber, 
  services = [],
  onClose, 
  onSave, 
  isSaving, 
  handleImageUpload 
}: { 
  barber: Barber | null, 
  services?: Service[],
  onClose: () => void, 
  onSave: (data: any) => void,
  isSaving: boolean,
  handleImageUpload: (file: File) => Promise<string>
}) => {
  const [formData, setFormData] = useState<Partial<Barber>>(
    barber || { 
      name: '', specialty: '', experience: '', rating: 5, image: '', 
      shiftStart: '09:00', shiftEnd: '18:00', workingDays: [1,2,3,4,5,6], 
      commission: 50, commissionRate: 50, phone: '', email: '', status: 'available', password: ''
    }
  );

  const [showPassword, setShowPassword] = useState(false);

  const handleGeneratePassword = () => {
    const randomCode = Math.floor(1000 + Math.random() * 9000);
    setFormData(prev => ({ ...prev, password: `Elite-${randomCode}` }));
    setShowPassword(true);
    toast.success("Mot de passe sécurisé généré !");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative w-full max-w-2xl bg-[#141414] rounded-3xl border border-[#D4AF37]/30 overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-2xl font-bold text-white">{barber ? 'Modifier' : 'Ajouter'} un Coiffeur</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X className="w-6 h-6 text-white/40" /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="block text-white/60 text-sm mb-2">Nom Complet</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="Ex: Jean Dupont" />
              </div>
              
              <div>
                <label className="block text-white/60 text-sm mb-2">Spécialité</label>
                <input type="text" value={formData.specialty} onChange={e => setFormData({ ...formData, specialty: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="Ex: Maître Barbier" />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/60 text-sm mb-2">Expérience</label>
                  <input type="text" value={formData.experience} onChange={e => setFormData({ ...formData, experience: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="Ex: 5 ans" />
                </div>
                <div>
                  <label className="block text-white/60 text-sm mb-2">Taux Commission (%)</label>
                  <input type="number" min="1" max="100" value={formData.commissionRate || formData.commission || 50} onChange={e => setFormData({ ...formData, commissionRate: parseInt(e.target.value) || 50, commission: parseInt(e.target.value) || 50 })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" />
                </div>
              </div>

              {/* Service Assignment Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/60 text-xs mb-2">Service Principal</label>
                  <select 
                    value={formData.mainServiceId || ''} 
                    onChange={e => setFormData({ ...formData, mainServiceId: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors text-xs"
                  >
                    <option value="" className="bg-[#141414] text-white/40">Aucun</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#141414]">{s.name}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-white/60 text-xs mb-2">Service Secondaire</label>
                  <select 
                    value={formData.secondaryServiceId || ''} 
                    onChange={e => setFormData({ ...formData, secondaryServiceId: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors text-xs"
                  >
                    <option value="" className="bg-[#141414] text-white/40">Aucun (Optionnel)</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id} className="bg-[#141414]">{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-white/60 text-sm mb-2">Téléphone</label>
                  <input type="text" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="06..." />
                </div>
                <div>
                  <label className="block text-white/30 text-sm mb-2 font-bold text-[#D4AF37]">E-mail (Login)</label>
                  <input type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/10 border border-[#D4AF37]/30 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors" placeholder="barber@mail.com" />
                </div>
              </div>

              {/* Security Access Control (Password Management) */}
              <div className="pt-4 border-t border-white/5 space-y-3">
                <h4 className="text-xs font-black text-[#D4AF37] uppercase tracking-wider">Sécurité & Accès</h4>
                <div>
                  <label className="block text-white/60 text-xs mb-2">Mot de Passe</label>
                  <div className="flex gap-2">
                    <input 
                      type={showPassword ? "text" : "password"} 
                      value={formData.password || ''} 
                      onChange={e => setFormData({ ...formData, password: e.target.value })} 
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-[#D4AF37] outline-none transition-colors font-mono text-sm" 
                      placeholder="••••••••"
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-4 bg-white/5 border border-white/10 rounded-xl text-white/60 hover:text-white transition-colors text-xs font-bold"
                    >
                      {showPassword ? "Masquer" : "Afficher"}
                    </button>
                    <button 
                      type="button"
                      onClick={handleGeneratePassword}
                      className="px-4 bg-[#D4AF37]/10 border border-[#D4AF37]/20 rounded-xl text-[#D4AF37] hover:bg-[#D4AF37]/20 transition-colors text-xs font-black"
                    >
                      Générer
                    </button>
                  </div>
                  <p className="text-[10px] text-white/30 mt-2 italic">Ce mot de passe sera utilisé pour les connexions directes du coiffeur.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <label className="block text-white/60 text-sm mb-2">Photo de Profil</label>
              <div className="relative aspect-square rounded-2xl bg-white/5 border-2 border-dashed border-white/10 overflow-hidden flex flex-col items-center justify-center gap-2 group hover:border-[#D4AF37]/50 transition-colors">
                {formData.image ? (
                  <img src={formData.image} alt="Preview" className="w-full h-full object-cover" />
                ) : (
                  <>
                    <ImageIcon className="w-8 h-8 text-white/20" />
                    <span className="text-xs text-white/20">Glissez ou cliquez</span>
                  </>
                )}
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const url = await handleImageUpload(file);
                    setFormData({ ...formData, image: url });
                  }
                }} />
              </div>
            </div>
          </div>
          
          <button onClick={() => onSave(formData)} disabled={isSaving} className="w-full mt-8 py-4 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-bold hover:shadow-lg hover:shadow-[#D4AF37]/20 transition-all active:scale-95 disabled:opacity-50">
            {isSaving ? 'Enregistrement...' : barber ? 'Mettre à jour' : 'Ajouter le coiffeur'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default BarberModal;
