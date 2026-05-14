import { useState } from 'react';
import { X, Eye, EyeOff, Scissors } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'client' | 'admin' | 'barber'>('client');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const { businessInfo, barbers } = useBusiness();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    await new Promise(r => setTimeout(r, 400)); // brief UX delay

    try {
      if (role === 'admin') {
        const adminEmail = businessInfo.adminEmail || 'admin@elitecuts.fr';
        const adminPass = businessInfo.adminPassword || 'admin';
        if (email !== adminEmail || password !== adminPass) {
          toast.error('Identifiants admin incorrects.');
          setIsLoading(false);
          return;
        }
        login(email, password, 'admin', 'Admin', 'admin');
      } else if (role === 'barber') {
        // Match against Firestore barbers using username OR email
        const barber = barbers.find(
          b => (b.email === email || b.username === email) && b.password === password && !b.archived
        );
        if (!barber) {
          toast.error('Coiffeur introuvable ou mot de passe incorrect.');
          setIsLoading(false);
          return;
        }
        // Pass the barber's real name and id
        login(email, password, 'barber', barber.name, barber.id);
      } else {
        // Client: any credentials work (public booking system)
        const clientName = email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        login(email, password, 'client', clientName);
      }

      onClose();
      navigate(`/${role}`);
    } catch (err) {
      toast.error('Une erreur est survenue. Réessayez.');
    } finally {
      setIsLoading(false);
    }
  };

  const roleLabels: Record<string, string> = { client: 'Client', barber: 'Coiffeur', admin: 'Admin' };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="relative w-full md:max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-8 pb-12 md:pb-8"
        >
          <button onClick={onClose} className="absolute top-4 right-4 p-2 text-white/40 hover:text-white transition-colors rounded-lg hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-6">
            <Scissors className="w-6 h-6 text-[#D4AF37]" />
            <span className="text-lg font-bold bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
              {businessInfo.name || 'Elite Cuts'}
            </span>
          </div>

          <h2 className="text-2xl font-bold mb-1 text-white">Connexion</h2>
          <p className="text-white/50 mb-6 text-sm">Connectez-vous à votre compte</p>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Role Selector */}
            <div>
              <label className="block text-white/60 text-sm mb-2">Type de compte</label>
              <div className="grid grid-cols-3 gap-2">
                {(['client', 'barber', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      role === r
                        ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black shadow-lg shadow-[#D4AF37]/20'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {roleLabels[r]}
                  </button>
                ))}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-white/60 text-sm mb-2">
                {role === 'barber' ? 'Email ou nom d\'utilisateur' : 'Email'}
              </label>
              <input
                type={role === 'barber' ? 'text' : 'email'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={role === 'barber' ? 'Votre email ou username' : 'votre@email.com'}
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-xl text-white placeholder:text-white/30 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30 transition-all"
                required
                autoComplete="username"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-white/60 text-sm mb-2">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 pr-12 bg-white/5 border border-[#D4AF37]/20 rounded-xl text-white placeholder:text-white/30 focus:border-[#D4AF37] focus:outline-none focus:ring-1 focus:ring-[#D4AF37]/30 transition-all"
                  required
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors">
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Hint */}
            {role === 'client' && (
              <p className="text-white/30 text-xs text-center bg-white/5 rounded-lg p-2">
                Clients : n'importe quels identifiants fonctionnent
              </p>
            )}
            {role === 'admin' && (
              <p className="text-white/30 text-xs text-center bg-white/5 rounded-lg p-2">
                Admin : email et mot de passe configurés dans les Paramètres
              </p>
            )}
            {role === 'barber' && (
              <p className="text-white/30 text-xs text-center bg-white/5 rounded-lg p-2">
                Utilisez l'email et le mot de passe fournis par l'admin
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-xl font-bold hover:shadow-lg hover:shadow-[#D4AF37]/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Connexion...</>
              ) : 'Se Connecter'}
            </button>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
