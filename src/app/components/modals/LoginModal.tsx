import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Scissors, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBusiness } from '../context/BusinessContext';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

// Demo accounts always available for testing
const DEMO_ACCOUNTS = [
  { role: 'admin' as const, label: 'Admin', emoji: '👑', email: 'admin-elite@test.com', password: 'password123', color: '#D4AF37', description: 'Tableau de bord admin' },
  { role: 'barber' as const, label: 'Coiffeur', emoji: '✂️', email: 'barber@test.com', password: 'password123', color: '#818cf8', description: 'Marcus Johnson' },
  { role: 'client' as const, label: 'Client', emoji: '👤', email: 'client@test.com', password: 'password123', color: '#34d399', description: 'Accès client' },
];

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, signup, user, isLoading: authLoading } = useAuth();
  const { businessInfo } = useBusiness();
  const navigate = useNavigate();

  // Handle redirect after successful login
  useEffect(() => {
    if (user && !authLoading) {
      onClose();
      // Use replace: true to prevent going back to login modal
      navigate(`/${user.role}`, { replace: true });
    }
  }, [user, authLoading, navigate, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Clear auth cache on new login attempt to prevent stale role redirection
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('user_profile_')) localStorage.removeItem(key);
    });

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (isLogin) {
        try {
          await login(cleanEmail, password);
        } catch (error: any) {
          // If admin@test.com login fails with "user not found", bootstrap it
          if (cleanEmail === 'admin@test.com' && (error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')) {
            toast.loading('Initialisation de l\'espace admin...');
            await signup(cleanEmail, password, 'Administrateur');
            toast.success('Compte Admin configuré !');
            return;
          }
          throw error;
        }
        toast.success('Bon retour !');
      } else {
        await signup(cleanEmail, password, name);
        toast.success('Bienvenue ! Votre compte a été créé.');
      }
    } catch (error: any) {
      console.error(error);
      let message = 'Une erreur est survenue';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        message = 'Email ou mot de passe incorrect';
      } else if (error.code === 'auth/email-already-in-use') {
        message = 'Cet email est déjà utilisé';
      } else if (error.code === 'auth/weak-password') {
        message = 'Le mot de passe est trop faible';
      }
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'linear-gradient(135deg, #141414, #1c1c1c)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, padding: '32px 24px 40px', overflowY: 'auto', maxHeight: '95vh' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Scissors style={{ width: 22, height: 22, color: '#D4AF37' }} />
            <span style={{ fontSize: 18, fontWeight: 700, background: 'linear-gradient(to right, #D4AF37, #FFD700)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {businessInfo.name || 'Elite Cuts'}
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer', color: 'rgba(255,255,255,0.5)', display: 'flex' }}>
            <X style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'white', marginBottom: 4 }}>
          {isLogin ? 'Connexion' : 'Inscription'}
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 24 }}>
          {isLogin ? 'Accédez à votre espace' : 'Rejoignez le salon Elite Cuts'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Toggle Login/Signup */}
          <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 4, marginBottom: 10 }}>
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: isLogin ? '#D4AF37' : 'transparent', color: isLogin ? 'black' : 'rgba(255,255,255,0.5)', transition: 'all 0.2s' }}
            >
              Connexion
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              style={{ flex: 1, padding: '8px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: !isLogin ? '#D4AF37' : 'transparent', color: !isLogin ? 'black' : 'rgba(255,255,255,0.5)', transition: 'all 0.2s' }}
            >
              Inscription (Client)
            </button>
          </div>

          {/* Quick Admin Access */}
          {isLogin && (
            <button
              type="button"
              onClick={async () => {
                // Use a truly unique demo email for this instance if needed, 
                // but try the standard one first.
                const adminEmail = 'admin-elite@test.com';
                const adminPass = 'password123';
                setIsSubmitting(true);
                
                try {
                  // Try 1: Login
                  await login(adminEmail, adminPass);
                } catch (error: any) {
                  toast.error('Erreur d\'authentification');
                } finally {
                  setIsSubmitting(false);
                }
              }}
              style={{ padding: '12px', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', marginBottom: 10 }}
            >
              <Zap style={{ width: 16, height: 16, color: '#D4AF37' }} />
              <span style={{ color: '#D4AF37', fontSize: 13, fontWeight: 700 }}>Accès Rapide Admin</span>
            </button>
          )}

          {!isLogin && (
            <div>
              <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6 }}>Nom Complet</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Votre nom"
                required
                style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
              />
            </div>
          )}

          {/* Email */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6 }}>Email / Identifiant</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="exemple@email.com"
              required
              style={{ width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
            />
          </div>

          {/* Password */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 6 }}>Mot de passe</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{ width: '100%', padding: '12px 44px 12px 14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10, color: 'white', fontSize: 15, boxSizing: 'border-box' }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>
                {showPassword ? <EyeOff style={{ width: 18, height: 18 }} /> : <Eye style={{ width: 18, height: 18 }} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%', padding: '13px', background: 'linear-gradient(to right, #D4AF37, #FFD700)',
              border: 'none', borderRadius: 12, color: 'black', fontSize: 15, fontWeight: 700,
              cursor: isSubmitting ? 'wait' : 'pointer', opacity: isSubmitting ? 0.7 : 1, marginTop: 4,
            }}
          >
            {isSubmitting ? 'Chargement...' : isLogin ? 'Se Connecter' : "S'inscrire"}
          </button>
        </form>


      </div>
    </div>
  );
}
