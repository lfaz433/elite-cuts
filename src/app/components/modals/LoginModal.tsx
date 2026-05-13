import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'client' | 'admin' | 'barber'>('client');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    login(email, password, role);
    onClose();
    navigate(`/${role}`);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          className="relative w-full md:max-w-md bg-gradient-to-br from-[#141414] to-[#1a1a1a] rounded-t-3xl md:rounded-2xl border border-[#D4AF37]/30 p-8 pb-12 md:pb-8"
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>

          <h2 className="text-3xl font-bold mb-2 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] bg-clip-text text-transparent">
            Welcome Back
          </h2>
          <p className="text-white/60 mb-8">Sign in to your account</p>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-white mb-2">Account Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(['client', 'barber', 'admin'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-4 py-2 rounded-lg capitalize transition-all ${
                      role === r
                        ? 'bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black'
                        : 'bg-white/5 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-white mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white placeholder:text-white/40 focus:border-[#D4AF37] focus:outline-none transition-colors"
                required
              />
            </div>

            <div>
              <label className="block text-white mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-white/5 border border-[#D4AF37]/20 rounded-lg text-white placeholder:text-white/40 focus:border-[#D4AF37] focus:outline-none transition-colors"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full px-6 py-3 bg-gradient-to-r from-[#D4AF37] to-[#FFD700] text-black rounded-lg hover:shadow-lg hover:shadow-[#D4AF37]/50 transition-all"
            >
              Sign In
            </button>

            <p className="text-center text-white/40 text-sm">
              Demo mode: Any credentials will work
            </p>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
